"use strict";

const express = require("express");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const app = express();
const port = Number(process.env.PORT) || 3000;
const dataFile = path.resolve(process.env.DATA_FILE || path.join(__dirname, "data", "db.json"));

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

let questions = [];
let courses = [];
let writeQueue = Promise.resolve();

async function loadQuestions() {
    try {
        const saved = JSON.parse(await fs.readFile(dataFile, "utf8"));
        if (!saved || !Array.isArray(saved.questions)) {
            throw new Error("The data file must contain a questions array.");
        }
        questions = saved.questions;
        courses = Array.isArray(saved.courses) ? saved.courses : defaultCourses.map((course) => ({ ...course }));
        if (!Array.isArray(saved.courses)) await persistData();
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        questions = defaultQuestions.map((question) => ({ ...question, options: [...question.options] }));
        courses = defaultCourses.map((course) => ({ ...course }));
        await persistData();
    }
}

function persistData() {
    const snapshot = JSON.stringify({ questions, courses }, null, 2);
    const temporaryFile = `${dataFile}.${process.pid}.tmp`;
    writeQueue = writeQueue.catch(() => {}).then(async () => {
        await fs.mkdir(path.dirname(dataFile), { recursive: true });
        await fs.writeFile(temporaryFile, snapshot, "utf8");
        await fs.rename(temporaryFile, dataFile);
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

app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
});
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});

app.get("/api/courses", (req, res) => {
    res.json({ data: courses });
});

app.get("/api/courses/:id", (req, res, next) => {
    const course = courses.find((item) => item.id === req.params.id);
    if (!course) return next(new HttpError(404, "Course not found."));
    res.json({ data: course });
});

app.post("/api/courses", async (req, res, next) => {
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

app.put("/api/courses/:id", async (req, res, next) => {
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

app.patch("/api/courses/:id", async (req, res, next) => {
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

app.delete("/api/courses/:id", async (req, res, next) => {
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

app.get("/api/questions", (req, res) => {
    res.json({ data: questions });
});

app.get("/api/questions/:id", (req, res, next) => {
    const question = questions.find((item) => item.id === req.params.id);
    if (!question) return next(new HttpError(404, "Question not found."));
    res.json({ data: question });
});

app.post("/api/questions", async (req, res, next) => {
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

app.put("/api/questions/:id", async (req, res, next) => {
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

app.patch("/api/questions/:id", async (req, res, next) => {
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

app.delete("/api/questions/:id", async (req, res, next) => {
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

app.use(express.static(__dirname));

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof HttpError ? error.status : (error.status === 400 ? 400 : 500);
    if (status === 500) console.error(error);
    res.status(status).json({
        error: status === 500 ? "Internal server error." : error.message
    });
});

loadQuestions().then(() => {
    app.listen(port, () => {
        console.log(`Examly server listening at http://localhost:${port}`);
    });
}).catch((error) => {
    console.error("Unable to load question data:", error);
    process.exitCode = 1;
});
