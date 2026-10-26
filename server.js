"use strict";

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { randomBytes, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { MongoClient } = require("mongodb");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = express();
const port = Number(process.env.PORT) || 3000;
const dataFile = path.resolve(process.env.DATA_FILE || path.join(__dirname, "data", "db.json"));
const nodeEnv = process.env.NODE_ENV || "development";
const configuredSessionSecret = process.env.SESSION_SECRET;
if (nodeEnv === "production" && !process.env.MONGODB_URI) {
    throw new Error("Set MONGODB_URI to the production MongoDB connection string.");
}
if (nodeEnv === "production" && (!configuredSessionSecret || configuredSessionSecret.length < 32)) {
    throw new Error("Set SESSION_SECRET to a random value of at least 32 characters in production.");
}
const sessionSecret = configuredSessionSecret || randomBytes(32).toString("hex");
const bootstrapAdminEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
const bootstrapAdminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
if ((bootstrapAdminEmail || bootstrapAdminPassword) &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapAdminEmail) || !bootstrapAdminPassword || bootstrapAdminPassword.length < 12)) {
    throw new Error("Set a valid admin email and a password of at least 12 characters.");
}

const defaultCourses = [
    { id: "java", name: "Java Programming", category: "Development", duration: "45 min", fee: 500, icon: "☕" },
    { id: "python", name: "Python Programming", category: "Development", duration: "45 min", fee: 600, icon: "🐍" },
    { id: "web", name: "Web Development", category: "Frontend", duration: "60 min", fee: 700, icon: "◇" },
    { id: "dbms", name: "Database Management", category: "Data", duration: "40 min", fee: 400, icon: "▣" },
    { id: "cloud", name: "Cloud Computing", category: "Infrastructure", duration: "50 min", fee: 800, icon: "☁" }
];

const defaultQuestions = [
    { id: "q1", question: "Which keyword is used to inherit a class in Java?", options: ["this", "extends", "implements", "super"], answer: 2 },
    { id: "q2", question: "What is the output type of input() in Python 3?", options: ["int", "float", "str", "bool"], answer: 3 },
    { id: "q3", question: "Which HTML element is used for the largest heading?", options: ["<heading>", "<h6>", "<h1>", "<head>"], answer: 3 },
    { id: "q4", question: "Which database object stores related records?", options: ["Table", "Trigger", "View", "Index"], answer: 1 },
    { id: "q5", question: "What does IaaS stand for?", options: ["Internet as a Service", "Infrastructure as a Service", "Integration as a Service", "Information as a System"], answer: 2 }
];

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

class MongoSessionStore extends session.Store {
    constructor(collectionProvider) {
        super();
        this.collectionProvider = collectionProvider;
    }

    get(sessionId, callback) {
        this.collectionProvider().findOne({ _id: sessionId, expiresAt: { $gt: new Date() } })
            .then((record) => callback(null, record ? record.session : null), callback);
    }

    set(sessionId, sessionData, callback) {
        const expiry = sessionData.cookie && sessionData.cookie.expires
            ? new Date(sessionData.cookie.expires)
            : new Date(Date.now() + (sessionData.cookie && sessionData.cookie.maxAge || 1000 * 60 * 60 * 8));
        this.collectionProvider().updateOne(
            { _id: sessionId },
            { $set: { session: sessionData, expiresAt: expiry } },
            { upsert: true }
        ).then(() => callback(null), callback);
    }

    destroy(sessionId, callback) {
        this.collectionProvider().deleteOne({ _id: sessionId })
            .then(() => callback(null), callback);
    }

    touch(sessionId, sessionData, callback) {
        this.set(sessionId, sessionData, callback);
    }
}

let questions = [];
let courses = [];
let writeQueue = Promise.resolve();
let mongoClient;
let db;
let mongoMemoryServer;

async function connectDatabase() {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
    const mongoDbName = process.env.MONGODB_DB || "examly";

    try {
        mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
        db = mongoClient.db(mongoDbName);
        await db.command({ ping: 1 });
        console.log(`Connected to MongoDB database ${mongoDbName}`);
        return db;
    } catch (error) {
        if (process.env.MONGODB_URI || nodeEnv === "production") {
            throw error;
        }

        mongoMemoryServer = await MongoMemoryServer.create({
            binary: { version: "7.0.14" }
        });
        const memoryUri = mongoMemoryServer.getUri();
        mongoClient = new MongoClient(memoryUri);
        await mongoClient.connect();
        db = mongoClient.db(mongoDbName);
        await db.command({ ping: 1 });
        console.log(`Connected to MongoDB memory server at ${memoryUri}/${mongoDbName}`);
        return db;
    }
}

async function syncDatabaseCollections() {
    const collections = await db.listCollections().toArray();
    const names = collections.map((item) => item.name);
    const required = ["courses", "questions", "users", "payments", "results", "app_meta", "sessions"];

    for (const name of required) {
        if (!names.includes(name)) {
            await db.createCollection(name);
        }
    }
    await db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

async function loadQuestions() {
    await connectDatabase();
    await syncDatabaseCollections();

    const courseCollection = db.collection("courses");
    const questionCollection = db.collection("questions");
    const userCollection = db.collection("users");
    const metaCollection = db.collection("app_meta");

    const marker = await metaCollection.findOne({ _id: "initial-data-loaded" });

    if (!marker) {
        let saved;

        try {
            saved = JSON.parse(await fs.readFile(dataFile, "utf8"));
            if (!saved || !Array.isArray(saved.questions)) {
                throw new Error("Invalid JSON data file.");
            }
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
            saved = {
                courses: defaultCourses.map((course) => ({ ...course })),
                questions: defaultQuestions.map((question) => ({
                    ...question,
                    options: [...question.options]
                }))
            };
        }

        const sourceCourses = Array.isArray(saved.courses) ? saved.courses : defaultCourses;

        if (await courseCollection.countDocuments() === 0 && sourceCourses.length > 0) {
            await courseCollection.insertMany(
                sourceCourses.map((item) => ({ ...item, _id: item.id }))
            );
        }

        if (await questionCollection.countDocuments() === 0 && Array.isArray(saved.questions) && saved.questions.length > 0) {
            await questionCollection.insertMany(
                saved.questions.map((item) => ({ ...item, _id: item.id }))
            );
        }

        await metaCollection.updateOne(
            { _id: "initial-data-loaded" },
            { $set: { completedAt: new Date() } },
            { upsert: true }
        );
    }

    if (bootstrapAdminEmail && bootstrapAdminPassword) {
        const adminExists = await userCollection.findOne({ email: bootstrapAdminEmail });
        if (!adminExists) {
            await userCollection.insertOne({
                id: `adm_${randomUUID().slice(0, 8)}`,
                name: "System Administrator",
                email: bootstrapAdminEmail.trim().toLowerCase(),
                passwordHash: await bcrypt.hash(bootstrapAdminPassword, 12),
                role: "admin",
                createdAt: new Date().toISOString()
            });
        }
    }

    courses = await courseCollection.find({}, { projection: { _id: 0 } }).toArray();
    questions = await questionCollection.find({}, { projection: { _id: 0 } }).toArray();
}

function persistData() {
    writeQueue = writeQueue.catch(() => {}).then(async () => {
        const syncCollection = async (name, items) => {
            const collection = db.collection(name);
            const ids = items.map((item) => item.id);

            if (items.length > 0) {
                await collection.bulkWrite(
                    items.map((item) => ({
                        replaceOne: {
                            filter: { _id: item.id },
                            replacement: { ...item, _id: item.id },
                            upsert: true
                        }
                    }))
                );
            }

            await collection.deleteMany({
                _id: { $nin: ids }
            });
        };

        await syncCollection("courses", courses);
        await syncCollection("questions", questions);
    });

    return writeQueue;
}

function validateQuestion(input, existing, requireAll) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new HttpError(400, "Request body must be a JSON object.");
    }

    const fields = ["question", "options", "answer"];
    if (requireAll && fields.some((field) => !Object.prototype.hasOwnProperty.call(input, field))) {
        throw new HttpError(400, "Question, options, and answer are required.");
    }

    const value = { ...existing, ...input };
    if (typeof value.question !== "string" || value.question.trim().length < 1 || value.question.trim().length > 500) {
        throw new HttpError(400, "Question must be a string of 1 to 500 characters.");
    }
    if (!Array.isArray(value.options) || value.options.length !== 4 ||
        value.options.some((option) => typeof option !== "string" || option.trim().length < 1 || option.trim().length > 200)) {
        throw new HttpError(400, "Options must contain exactly four non-empty strings of at most 200 characters.");
    }
    if (!Number.isInteger(value.answer) || value.answer < 1 || value.answer > 4) {
        throw new HttpError(400, "Answer must be an integer from 1 to 4.");
    }

    return {
        question: value.question.trim(),
        options: value.options.map((option) => option.trim()),
        answer: value.answer
    };
}

function validateCourse(input, existing, requireAll) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new HttpError(400, "Request body must be a JSON object.");
    }

    const fields = ["name", "category", "duration", "fee", "icon"];
    if (requireAll && fields.some((field) => !Object.prototype.hasOwnProperty.call(input, field))) {
        throw new HttpError(400, "Name, category, duration, fee, and icon are required.");
    }

    const value = { ...existing, ...input };
    for (const field of ["name", "category", "duration", "icon"]) {
        const maxLength = field === "name" ? 100 : field === "category" ? 60 : field === "duration" ? 40 : 8;
        if (typeof value[field] !== "string" || value[field].trim().length < 1 || value[field].trim().length > maxLength) {
            throw new HttpError(400, `${field} must be a non-empty string of at most ${maxLength} characters.`);
        }
    }
    if (typeof value.fee !== "number" || !Number.isFinite(value.fee) || value.fee < 0 || value.fee > 10000000) {
        throw new HttpError(400, "Fee must be a number from 0 to 10000000.");
    }
    if (courses.some((course) => course.id !== existing.id && course.name.toLowerCase() === value.name.trim().toLowerCase())) {
        throw new HttpError(409, "A course with this name already exists.");
    }

    return {
        name: value.name.trim(),
        category: value.category.trim(),
        duration: value.duration.trim(),
        fee: value.fee,
        icon: value.icon.trim()
    };
}

function sanitizeUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || null,
        college: user.college || null,
        registeredExams: user.registeredExams || [],
        paymentStatus: user.paymentStatus || "Not Paid"
    };
}

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Authentication required." });
    }
    next();
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.session || !req.session.user || req.session.user.role !== role) {
            return res.status(403).json({ error: "You do not have permission to access this resource." });
        }
        next();
    };
}

app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
});

app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    store: new MongoSessionStore(() => db.collection("sessions")),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: nodeEnv === "production",
        maxAge: 1000 * 60 * 60 * 8
    }
}));

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", database: db ? "connected" : "pending" });
});

app.post("/api/auth/register", async (req, res, next) => {
    try {
        const role = String(req.body.role || "student").toLowerCase();
        if (role !== "student") {
            throw new HttpError(403, "Only student accounts can be self-registered.");
        }

        const name = String(req.body.name || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const phone = String(req.body.phone || "").trim();
        const college = String(req.body.college || "").trim();
        const password = String(req.body.password || "");

        if (name.length < 2 || !/^[0-9]{10}$/.test(phone.replace(/\D/g, ""))) {
            throw new HttpError(400, "Provide a valid name and 10-digit phone number.");
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new HttpError(400, "Provide a valid email address.");
        }
        if (college.length < 2) {
            throw new HttpError(400, "Provide a valid college name.");
        }
        if (password.length < 6) {
            throw new HttpError(400, "Password must be at least 6 characters long.");
        }

        const usersCollection = db.collection("users");
        const existing = await usersCollection.findOne({ email });
        if (existing) {
            throw new HttpError(409, "An account with this email already exists.");
        }

        const created = {
            id: `stu_${randomUUID().slice(0, 8)}`,
            name,
            email,
            phone: `+91 ${phone.replace(/\D/g, "").slice(-10)}`,
            college,
            passwordHash: await bcrypt.hash(password, 10),
            role: "student",
            registeredExams: [],
            paymentStatus: "Not Paid",
            createdAt: new Date().toISOString()
        };

        await usersCollection.insertOne(created);
        res.status(201).json({
            message: "Account created successfully.",
            user: sanitizeUser(created)
        });
    } catch (error) {
        next(error);
    }
});

async function handleLogin(req, res, next) {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");
        const desiredRole = String(req.body.role || "student").toLowerCase();

        if (!email || !password) {
            throw new HttpError(400, "Email and password are required.");
        }

        const usersCollection = db.collection("users");
        const user = await usersCollection.findOne({ email });
        if (!user) {
            throw new HttpError(401, "Invalid email or password.");
        }

        const isAdminLogin = desiredRole === "admin";
        const validPassword = await bcrypt.compare(password, user.passwordHash || "");

        if (!validPassword || (isAdminLogin && user.role !== "admin")) {
            throw new HttpError(401, "Invalid email or password.");
        }

        if (!isAdminLogin && user.role !== "student") {
            throw new HttpError(403, "This account type is not allowed for student sign in.");
        }

        req.session.user = sanitizeUser(user);
        res.json({
            message: "Login successful.",
            user: req.session.user
        });
    } catch (error) {
        next(error);
    }
}

app.post("/api/auth/login", handleLogin);

app.post("/api/auth/admin-login", async (req, res, next) => {
    req.body.role = "admin";
    return handleLogin(req, res, next);
});

app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.session.user });
});

app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({ error: "Unable to log out at this time." });
        }
        res.json({ ok: true });
    });
});

app.get("/api/students", requireAuth, requireRole("admin"), async (req, res) => {
    const usersCollection = db.collection("users");
    const users = await usersCollection.find({ role: "student" }, { projection: { passwordHash: 0 } }).toArray();
    res.json({ data: users });
});

app.get("/api/students/me", requireAuth, requireRole("student"), async (req, res) => {
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ id: req.session.user.id }, { projection: { passwordHash: 0 } });
    if (!user) {
        return res.status(404).json({ error: "Student profile not found." });
    }
    res.json({ data: user });
});

app.put("/api/students/me", requireAuth, requireRole("student"), async (req, res, next) => {
    try {
        const name = String(req.body.name || "").trim();
        const phone = String(req.body.phone || "").replace(/\D/g, "");
        const college = String(req.body.college || "").trim().replace(/\s+/g, " ");
        if (name.length < 2 || name.length > 100) {
            throw new HttpError(400, "Name must be between 2 and 100 characters.");
        }
        if (!/^[0-9]{10}$/.test(phone)) {
            throw new HttpError(400, "Provide a valid 10-digit phone number.");
        }
        if (college.length < 2 || college.length > 150) {
            throw new HttpError(400, "College must be between 2 and 150 characters.");
        }

        const usersCollection = db.collection("users");
        const update = await usersCollection.updateOne(
            { id: req.session.user.id, role: "student" },
            { $set: { name, phone: `+91 ${phone}`, college } }
        );
        if (!update.matchedCount) throw new HttpError(404, "Student profile not found.");
        const user = await usersCollection.findOne(
            { id: req.session.user.id },
            { projection: { passwordHash: 0 } }
        );
        req.session.user = sanitizeUser(user);
        res.json({ data: user });
    } catch (error) {
        next(error);
    }
});

app.post("/api/students/me/registrations", requireAuth, requireRole("student"), async (req, res, next) => {
    try {
        const courseIds = req.body.courseIds;
        if (!Array.isArray(courseIds) || courseIds.length < 1 || courseIds.length > 20 ||
            courseIds.some((id) => typeof id !== "string")) {
            throw new HttpError(400, "Select between 1 and 20 valid courses.");
        }
        const uniqueIds = [...new Set(courseIds)];
        const selectedCourses = await db.collection("courses")
            .find({ id: { $in: uniqueIds } }, { projection: { _id: 0 } })
            .toArray();
        if (selectedCourses.length !== uniqueIds.length) {
            throw new HttpError(404, "One or more selected courses no longer exist.");
        }

        const usersCollection = db.collection("users");
        const update = await usersCollection.updateOne(
            { id: req.session.user.id, role: "student" },
            { $set: { registeredExams: selectedCourses, paymentStatus: "Demo registration" } }
        );
        if (!update.matchedCount) throw new HttpError(404, "Student profile not found.");
        const user = await usersCollection.findOne(
            { id: req.session.user.id },
            { projection: { passwordHash: 0 } }
        );
        req.session.user = sanitizeUser(user);
        res.json({ data: user, message: "Demo registration saved. No payment was processed." });
    } catch (error) {
        next(error);
    }
});

app.get("/api/payments", requireAuth, requireRole("admin"), async (req, res) => {
    const paymentsCollection = db.collection("payments");
    const records = await paymentsCollection.find({}).toArray();
    res.json({ data: records });
});

app.get("/api/results", requireAuth, async (req, res) => {
    const resultsCollection = db.collection("results");
    const results = await resultsCollection.find({}).toArray();
    if (req.session.user.role === "student") {
        const filtered = results.filter((item) => item.studentId === req.session.user.id);
        return res.json({ data: filtered });
    }
    res.json({ data: results });
});

app.get("/api/admin/summary", requireAuth, requireRole("admin"), async (req, res) => {
    const usersCollection = db.collection("users");
    const courseCollection = db.collection("courses");
    const questionCollection = db.collection("questions");
    const paymentCollection = db.collection("payments");
    const resultCollection = db.collection("results");

    const [studentCount, courseCount, questionCount, paymentCount, resultCount] = await Promise.all([
        usersCollection.countDocuments({ role: "student" }),
        courseCollection.countDocuments(),
        questionCollection.countDocuments(),
        paymentCollection.countDocuments(),
        resultCollection.countDocuments()
    ]);

    res.json({
        data: {
            students: studentCount,
            payments: paymentCount,
            results: resultCount,
            questions: questionCount,
            courses: courseCount
        }
    });
});

app.get("/api/courses", (req, res) => {
    res.json({ data: courses });
});

app.get("/api/courses/:id", (req, res, next) => {
    const course = courses.find((item) => item.id === req.params.id);
    if (!course) return next(new HttpError(404, "Course not found."));
    res.json({ data: course });
});

app.post("/api/courses", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const fields = validateCourse(req.body, {}, true);
        const course = { id: randomUUID(), ...fields };
        courses.push(course);
        await persistData();
        res.status(201).json({ data: course });
    } catch (error) {
        next(error);
    }
});

app.put("/api/courses/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const index = courses.findIndex((item) => item.id === req.params.id);
        if (index === -1) throw new HttpError(404, "Course not found.");
        const fields = validateCourse(req.body, courses[index], true);
        const updated = { id: courses[index].id, ...fields };
        courses[index] = updated;
        await persistData();
        res.json({ data: updated });
    } catch (error) {
        next(error);
    }
});

app.patch("/api/courses/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const index = courses.findIndex((item) => item.id === req.params.id);
        if (index === -1) throw new HttpError(404, "Course not found.");
        const fields = validateCourse(req.body, courses[index], false);
        const updated = { id: courses[index].id, ...fields };
        courses[index] = updated;
        await persistData();
        res.json({ data: updated });
    } catch (error) {
        next(error);
    }
});

app.delete("/api/courses/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const index = courses.findIndex((item) => item.id === req.params.id);
        if (index === -1) throw new HttpError(404, "Course not found.");
        courses.splice(index, 1);
        await persistData();
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

app.get("/api/questions", requireAuth, requireRole("admin"), (req, res) => {
    res.json({ data: questions });
});

app.get("/api/questions/:id", requireAuth, requireRole("admin"), (req, res, next) => {
    const question = questions.find((item) => item.id === req.params.id);
    if (!question) return next(new HttpError(404, "Question not found."));
    res.json({ data: question });
});

app.get("/api/exams/:courseId/questions", requireAuth, requireRole("student"), (req, res, next) => {
    const course = courses.find((item) => item.id === req.params.courseId);
    if (!course) return next(new HttpError(404, "Course not found."));
    if (!(req.session.user.registeredExams || []).some((item) => item.id === course.id)) {
        return next(new HttpError(403, "Register for this assessment before starting it."));
    }
    if (!questions.length) return next(new HttpError(404, "No questions are available for this assessment."));

    res.json({
        data: {
            course: { id: course.id, name: course.name, duration: course.duration },
            questions: questions.map(({ id, question, options }) => ({ id, question, options }))
        }
    });
});

app.post("/api/exams/:courseId/submit", requireAuth, requireRole("student"), async (req, res, next) => {
    try {
        const course = courses.find((item) => item.id === req.params.courseId);
        if (!course) throw new HttpError(404, "Course not found.");
        if (!(req.session.user.registeredExams || []).some((item) => item.id === course.id)) {
            throw new HttpError(403, "Register for this assessment before submitting answers.");
        }
        if (!questions.length) throw new HttpError(404, "No questions are available for this assessment.");

        const answers = req.body.answers;
        if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
            throw new HttpError(400, "Answers must be provided as a question-to-option map.");
        }

        const score = questions.reduce((total, item) => {
            return total + (Number.isInteger(answers[item.id]) && answers[item.id] === item.answer ? 1 : 0);
        }, 0);
        const percentage = Math.round((score / questions.length) * 100);
        const result = {
            id: randomUUID(),
            studentId: req.session.user.id,
            studentName: req.session.user.name,
            examName: course.name,
            courseId: course.id,
            score,
            total: questions.length,
            percentage,
            status: percentage >= 40 ? "Pass" : "Need Improvement",
            submittedAt: new Date().toISOString()
        };

        await db.collection("results").insertOne(result);
        res.status(201).json({ data: result });
    } catch (error) {
        next(error);
    }
});

app.post("/api/questions", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const fields = validateQuestion(req.body, {}, true);
        const question = { id: randomUUID(), ...fields };
        questions.push(question);
        await persistData();
        res.status(201).json({ data: question });
    } catch (error) {
        next(error);
    }
});

app.put("/api/questions/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const index = questions.findIndex((item) => item.id === req.params.id);
        if (index === -1) throw new HttpError(404, "Question not found.");
        const fields = validateQuestion(req.body, {}, true);
        const updated = { id: questions[index].id, ...fields };
        questions[index] = updated;
        await persistData();
        res.json({ data: updated });
    } catch (error) {
        next(error);
    }
});

app.patch("/api/questions/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const index = questions.findIndex((item) => item.id === req.params.id);
        if (index === -1) throw new HttpError(404, "Question not found.");
        const fields = validateQuestion(req.body, questions[index], false);
        const updated = { id: questions[index].id, ...fields };
        questions[index] = updated;
        await persistData();
        res.json({ data: updated });
    } catch (error) {
        next(error);
    }
});

app.delete("/api/questions/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
        const index = questions.findIndex((item) => item.id === req.params.id);
        if (index === -1) throw new HttpError(404, "Question not found.");
        questions.splice(index, 1);
        await persistData();
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found." });
});

app.use((req, res, next) => {
    const requestedPath = req.path.toLowerCase();
    if (
        requestedPath.startsWith("/data/") ||
        requestedPath.startsWith("/server") ||
        requestedPath === "/package.json" ||
        requestedPath === "/package-lock.json" ||
        requestedPath === "/readme.md" ||
        requestedPath.endsWith(".bak") ||
        requestedPath.endsWith(".env")
    ) {
        return res.sendStatus(404);
    }
    next();
});

app.use(express.static(__dirname, { dotfiles: "deny" }));

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof HttpError ? error.status : (error.status === 400 ? 400 : 500);
    if (status === 500) console.error(error);
    res.status(status).json({
        error: status === 500 ? "Internal server error." : error.message
    });
});

async function startServer() {
    await loadQuestions();
    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            console.log(`Examly server listening at http://localhost:${port}`);
            resolve(server);
        });
    });
}

startServer().catch((error) => {
    console.error("Unable to load question data:", error);
    process.exitCode = 1;
});

process.on("SIGINT", async () => {
    if (mongoClient) {
        await mongoClient.close();
    }
    if (mongoMemoryServer) {
        await mongoMemoryServer.stop();
    }
    process.exit(0);
});

