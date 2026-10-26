(function () {
    const STORAGE_KEYS = {
        students: "examly_students",
        admins: "examly_admins",
        courses: "examly_courses",
        questions: "examly_questions",
        results: "examly_results",
        payments: "examly_payments",
        selectedExams: "examly_selected_exams",
        session: "examly_session"
    };

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

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null || raw === undefined) return fallback;
            return JSON.parse(raw);
        } catch (error) {
            return fallback;
        }
    }

    function write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function id(prefix) {
        return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }

    function normalizeCollege(value) {
        return String(value || "").trim().replace(/\s+/g, " ");
    }

    function notify(message, type) {
        const toast = document.getElementById("toast");
        if (!toast) {
            window.alert(message);
            return;
        }

        toast.textContent = message;
        toast.classList.remove("error", "success", "warning");
        if (type === "error") toast.classList.add("error");
        else if (type === "warning") toast.classList.add("warning");
        else toast.classList.add("success");
        toast.classList.add("show");
        clearTimeout(notify.timeoutId);
        notify.timeoutId = setTimeout(function () {
            toast.classList.remove("show");
        }, 2200);
    }

    function ensureDemoData() {
        const courses = read(STORAGE_KEYS.courses, null);
        if (!courses || !Array.isArray(courses) || courses.length === 0) {
            write(STORAGE_KEYS.courses, defaultCourses.map(function (course) { return { ...course }; }));
        }

        const questions = read(STORAGE_KEYS.questions, null);
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            write(STORAGE_KEYS.questions, defaultQuestions.map(function (question) { return ({ ...question, options: question.options.slice() }); }));
        }

        if (!read(STORAGE_KEYS.results, null)) {
            write(STORAGE_KEYS.results, []);
        }

        if (!read(STORAGE_KEYS.payments, null)) {
            write(STORAGE_KEYS.payments, []);
        }
    }

    function getCurrentSession() {
        return read(STORAGE_KEYS.session, null);
    }

    async function apiRequest(path, init, fallback) {
        let response;
        try {
            response = await fetch(path, {
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                ...init
            });
        } catch (error) {
            if (typeof fallback === "function") {
                return fallback();
            }
            throw error;
        }

        const text = await response.text();
        const payload = text ? JSON.parse(text) : {};
        if (!response.ok) {
            throw new Error(payload.error || payload.message || "Request failed.");
        }
        return payload;
    }

    function setSession(role, user) {
        if (!user) {
            localStorage.removeItem(STORAGE_KEYS.session);
            return;
        }

        write(STORAGE_KEYS.session, {
            role: role,
            userId: user.id || user.username,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role || role,
                phone: user.phone,
                college: user.college,
                registeredExams: user.registeredExams || [],
                paymentStatus: user.paymentStatus || "Not Paid"
            }
        });
    }

    function currentStudent() {
        const session = getCurrentSession();
        if (!session || session.role !== "student") return null;
        if (session.user && session.user.id === session.userId) return session.user;
        return null;
    }

    function currentAdmin() {
        const session = getCurrentSession();
        if (!session || session.role !== "admin") return null;
        if (session.user && (session.user.id === session.userId || session.user.username === session.userId)) return session.user;
        return null;
    }

    function logout() {
        setSession(null, null);
        if (window.location.pathname.endsWith("/admin-dashboard.html") || window.location.pathname.endsWith("admin-dashboard.html")) {
            window.location.href = "admin-login.html";
            return;
        }
        window.location.href = "index.html";
    }

    function setupPasswordToggle() {
        document.querySelectorAll("[data-toggle-password]").forEach(function (button) {
            const target = button.closest(".password-input")?.querySelector("input");
            if (!target) return;

            button.addEventListener("click", function () {
                const isHidden = target.type === "password";
                target.type = isHidden ? "text" : "password";
                button.textContent = isHidden ? "Hide" : "Show";
            });
        });
    }

    function setupRegister() {
        const form = document.getElementById("registerForm");
        if (!form) return;

        if (currentStudent()) {
            window.location.href = "dashboard.html";
            return;
        }

        const roleSelect = document.getElementById("accountRole");
        const roleNote = document.getElementById("roleNote");
        function updateRoleNote() {
            const role = roleSelect ? roleSelect.value : "student";
            if (role === "faculty") {
                if (roleNote) roleNote.textContent = "Faculty accounts require admin approval. Use the Student registration form for now.";
                return;
            }
            if (role === "admin") {
                if (roleNote) roleNote.textContent = "Admin accounts are managed separately. Selecting Admin will open the administrator sign in.";
                return;
            }
            if (roleNote) roleNote.textContent = "Create your student account.";
        }

        updateRoleNote();
        roleSelect && roleSelect.addEventListener("change", updateRoleNote);

        form.addEventListener("submit", async function (event) {
            event.preventDefault();

            const role = roleSelect ? roleSelect.value : "student";
            if (role === "admin") {
                window.location.href = "admin-login.html";
                return;
            }

            if (role === "faculty") {
                notify("Faculty registration is not available yet. Please contact the admin to create a faculty account.", "error");
                return;
            }

            const name = document.getElementById("name").value.trim();
            const email = document.getElementById("email").value.trim().toLowerCase();
            const phoneRaw = document.getElementById("phone").value.replace(/\D/g, "");
            const college = normalizeCollege(document.getElementById("college").value);
            const password = document.getElementById("password").value;
            const confirmPassword = document.getElementById("confirmPassword").value;

            if (name.length < 2 || !/^[0-9]{10}$/.test(phoneRaw)) {
                notify("Enter a valid name and 10-digit phone number.", "error");
                return;
            }

            if (!college || college.length < 2) {
                notify("Enter a valid college name.", "error");
                return;
            }

            if (password.length < 6) {
                notify("Password must be at least 6 characters.", "error");
                return;
            }

            if (password !== confirmPassword) {
                notify("Passwords do not match.", "error");
                return;
            }

            try {
                const payload = await apiRequest("/api/auth/register", {
                    method: "POST",
                    body: JSON.stringify({
                        name,
                        email,
                        phone: phoneRaw,
                        college,
                        password,
                        role: "student"
                    })
                });

                notify(payload.message || "Account created. You can now sign in.");
                setTimeout(function () {
                    window.location.href = "login.html";
                }, 700);
            } catch (error) {
                notify(error.message || "Unable to create account.", "error");
            }
        });
    }

    function setupStudentLogin() {
        const form = document.getElementById("loginForm");
        if (!form) return;

        if (currentStudent()) {
            window.location.href = "dashboard.html";
            return;
        }

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const email = document.getElementById("email").value.trim().toLowerCase();
            const password = document.getElementById("password").value;

            try {
                const payload = await apiRequest("/api/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ email, password, role: "student" })
                });

                const sessionUser = payload.user || { email };
                setSession("student", sessionUser);
                notify(payload.message || "Login successful. Redirecting...");
                setTimeout(function () {
                    window.location.href = "dashboard.html";
                }, 500);
            } catch (error) {
                notify(error.message || "Invalid email or password.", "error");
            }
        });
    }

    function setupAdminLogin() {
        const form = document.getElementById("adminLoginForm");
        if (!form) return;

        if (currentAdmin()) {
            window.location.href = "admin-dashboard.html";
            return;
        }

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const email = document.getElementById("adminUsername").value.trim().toLowerCase();
            const password = document.getElementById("adminPassword").value;

            try {
                const payload = await apiRequest("/api/auth/admin-login", {
                    method: "POST",
                    body: JSON.stringify({ email: email, password, role: "admin" })
                });

                const adminUser = payload.user || { id: email, name: "Administrator", role: "admin" };
                setSession("admin", adminUser);
                notify(payload.message || "Admin access granted.");
                setTimeout(function () {
                    window.location.href = "admin-dashboard.html";
                }, 500);
            } catch (error) {
                notify(error.message || "Invalid admin credentials.", "error");
            }
        });
    }

    async function setupGuards() {
        const body = document.body;
        const guard = body && body.dataset && body.dataset.guard;
        const storedSession = getCurrentSession();
        if (!guard && !storedSession) return true;

        try {
            const payload = await apiRequest("/api/auth/me");
            if (guard && payload.user.role !== guard) throw new Error("Wrong account type.");
            setSession(payload.user.role, payload.user);
        } catch (error) {
            setSession(null, null);
            if (guard) {
                window.location.href = guard === "admin" ? "admin-login.html" : "login.html";
                return false;
            }
        }

        if (guard === "student" && !currentStudent()) {
            window.location.href = "login.html";
            return false;
        }
        if (guard === "admin" && !currentAdmin()) {
            window.location.href = "admin-login.html";
            return false;
        }
        return true;
    }

    function setupLogoutButtons() {
        document.querySelectorAll("[data-logout]").forEach(function (button) {
            button.addEventListener("click", async function (event) {
                event.preventDefault();
                try {
                    await apiRequest("/api/auth/logout", { method: "POST" });
                } catch {}
                setSession(null, null);
                window.location.href = "index.html";
            });
        });
    }

    function getCourses() {
        const stored = read(STORAGE_KEYS.courses, defaultCourses);
        return Array.isArray(stored) ? stored : defaultCourses;
    }

    function getQuestions() {
        const stored = read(STORAGE_KEYS.questions, defaultQuestions);
        return Array.isArray(stored) ? stored : defaultQuestions;
    }

    async function renderStudentDashboard() {
        let student = currentStudent();
        if (!student) return;

        try {
            const payload = await apiRequest("/api/students/me", {}, function () { return { data: student }; });
            student = { ...student, ...payload.data };
            setSession("student", student);
        } catch (error) {
            notify(error.message || "Unable to load your profile.", "error");
        }

        let results = read(STORAGE_KEYS.results, []);
        try {
            const payload = await apiRequest("/api/results", {}, function () { return { data: results }; });
            results = payload.data;
            write(STORAGE_KEYS.results, results);
        } catch (error) {
            notify(error.message || "Unable to load your results.", "error");
        }
        const resultRows = results.filter(function (result) {
            return result.studentId === student.id;
        });

        const registeredCount = document.getElementById("registeredCount");
        const completedCount = document.getElementById("completedCount");
        const averageScore = document.getElementById("averageScore");
        const paymentState = document.getElementById("paymentState");
        const welcomeName = document.getElementById("welcomeName");
        const upcomingList = document.getElementById("upcomingList");

        if (welcomeName) welcomeName.textContent = student.name.split(" ")[0];
        if (registeredCount) registeredCount.textContent = String((student.registeredExams || []).length);

        const completed = resultRows.length;
        if (completedCount) completedCount.textContent = String(completed);

        if (averageScore) {
            if (!resultRows.length) averageScore.textContent = "—";
            else {
                const avg = Math.round(resultRows.reduce(function (sum, row) { return sum + Number(row.percentage || 0); }, 0) / resultRows.length);
                averageScore.textContent = avg + "%";
            }
        }

        if (paymentState) paymentState.textContent = student.paymentStatus || "Pending";

        if (upcomingList) {
            const exams = student.registeredExams && student.registeredExams.length ? student.registeredExams : [];
            if (!exams.length) {
                upcomingList.innerHTML = "<li class='empty'>No exams enrolled yet. Browse the catalog to get started.</li>";
                return;
            }

            upcomingList.replaceChildren(...exams.map(function (exam) {
                const examData = typeof exam === "string" ? { id: exam, name: exam } : exam;
                const item = document.createElement("li");
                const name = document.createElement("strong");
                const link = document.createElement("a");
                name.textContent = examData.name || "Assessment";
                link.href = "take-exam.html?course=" + encodeURIComponent(examData.id);
                link.textContent = "Start assessment";
                item.append(name, link);
                return item;
            }));
        }
    }

    async function renderStudentResults() {
        const student = currentStudent();
        if (!student) return;

        let results;
        try {
            const payload = await apiRequest("/api/results", {}, function () { return { data: read(STORAGE_KEYS.results, []) }; });
            results = payload.data;
            write(STORAGE_KEYS.results, results);
        } catch (error) {
            results = read(STORAGE_KEYS.results, []);
        }
        const rows = results.filter(function (row) {
            return row.studentId === student.id;
        });

        const resultRows = document.getElementById("resultRows");
        if (!resultRows) return;

        renderTextTable(resultRows, rows.map(function (row) {
            return [row.examName, row.score, row.percentage + "%", row.status, new Date(row.submittedAt).toLocaleDateString()];
        }), "No results yet. Complete an exam to see your performance.", 5);
    }

    function renderProfile() {
        const student = currentStudent();
        if (!student) return;

        const profileName = document.getElementById("profileName");
        const profileEmail = document.getElementById("profileEmail");
        const profileCollege = document.getElementById("profileCollege");
        const profilePhone = document.getElementById("profilePhone");
        const paymentStatus = document.getElementById("paymentStatus");
        const profilePaymentMethod = document.getElementById("profilePaymentMethod");
        const transactionId = document.getElementById("transactionId");
        const profileExams = document.getElementById("profileExams");
        const editName = document.getElementById("editName");
        const editPhone = document.getElementById("editPhone");
        const editCollege = document.getElementById("editCollege");

        if (profileName) profileName.textContent = student.name;
        if (profileEmail) profileEmail.textContent = student.email;
        if (profileCollege) profileCollege.textContent = student.college;
        if (profilePhone) profilePhone.textContent = student.phone;
        if (paymentStatus) paymentStatus.textContent = student.paymentStatus || "Not Paid";
        if (profilePaymentMethod) profilePaymentMethod.textContent = student.paymentMethod || "—";
        if (transactionId) transactionId.textContent = student.transactionId || "—";
        if (editName) editName.value = student.name;
        if (editPhone) editPhone.value = student.phone ? student.phone.replace("+91 ", "") : "";
        if (editCollege) editCollege.value = student.college;

        if (profileExams) {
            if (!student.registeredExams || !student.registeredExams.length) {
                const empty = document.createElement("span");
                empty.className = "tag";
                empty.textContent = "No exams yet";
                profileExams.replaceChildren(empty);
            } else {
                profileExams.replaceChildren(...student.registeredExams.map(function (exam) {
                    const tag = document.createElement("span");
                    tag.className = "tag";
                    tag.textContent = exam.name || exam;
                    return tag;
                }));
            }
        }
    }

    function renderTextTable(body, records, emptyMessage, columnCount) {
        const rows = records.map(function (record) {
            const row = document.createElement("tr");
            record.forEach(function (value) {
                const cell = document.createElement("td");
                cell.textContent = value == null ? "" : String(value);
                row.append(cell);
            });
            return row;
        });
        if (!rows.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = columnCount;
            cell.textContent = emptyMessage;
            row.append(cell);
            rows.push(row);
        }
        body.replaceChildren(...rows);
    }

    function setupProfileForm() {
        const form = document.getElementById("profileForm");
        if (!form) return;

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const student = currentStudent();
            if (!student) return;

            const name = document.getElementById("editName").value.trim();
            const phone = document.getElementById("editPhone").value.replace(/\D/g, "");
            const college = normalizeCollege(document.getElementById("editCollege").value);

            if (name.length < 2 || !/^[0-9]{10}$/.test(phone)) {
                notify("Enter a valid name and 10-digit phone number.", "error");
                return;
            }

            const students = read(STORAGE_KEYS.students, []);
            try {
                const payload = await apiRequest("/api/students/me", {
                    method: "PUT",
                    body: JSON.stringify({ name, phone, college })
                }, function () {
                    const index = students.findIndex(function (item) { return item.id === student.id; });
                    if (index === -1) throw new Error("Profile updates require the Examly server.");
                    students[index] = { ...students[index], name, phone: "+91 " + phone, college };
                    write(STORAGE_KEYS.students, students);
                    return { data: students[index] };
                });
                const updatedStudent = { ...student, ...payload.data };
                const index = students.findIndex(function (item) { return item.id === student.id; });
                if (index !== -1) {
                    students[index] = updatedStudent;
                    write(STORAGE_KEYS.students, students);
                }
                setSession("student", updatedStudent);
                renderProfile();
                notify("Profile updated successfully.");
            } catch (error) {
                notify(error.message || "Unable to update your profile.", "error");
            }
        });
    }

    async function setupCourseSelection() {
        const form = document.getElementById("registrationForm");
        if (!form) return;

        let courses = getCourses();
        try {
            const payload = await apiRequest("/api/courses", {}, function () { return { data: courses }; });
            courses = payload.data;
            write(STORAGE_KEYS.courses, courses);
        } catch (error) {
            notify(error.message || "Unable to load the course catalog.", "error");
        }
        const examOptions = document.getElementById("examOptions");
        const countLabel = document.getElementById("courseCount");
        const total = document.getElementById("total");
        const discount = document.getElementById("discount");
        const final = document.getElementById("final");
        const discountInput = document.getElementById("discountPercent");
        const selectedMap = new Map();

        if (countLabel) countLabel.textContent = courses.length + " courses available";

        examOptions.replaceChildren(...courses.map(function (course) {
            const label = document.createElement("label");
            const input = document.createElement("input");
            const content = document.createElement("span");
            const name = document.createElement("strong");
            const meta = document.createElement("small");
            const fee = document.createElement("b");
            label.className = "exam-option";
            input.type = "checkbox";
            input.value = course.id;
            input.dataset.fee = String(course.fee);
            input.dataset.name = course.name;
            name.textContent = course.icon + " " + course.name;
            meta.textContent = course.category + " · " + course.duration;
            fee.textContent = "₹" + course.fee;
            content.append(name, meta, fee);
            label.append(input, content);
            return label;
        }));

        function updateSummary() {
            const selected = Array.from(examOptions.querySelectorAll("input:checked"));
            const subtotal = selected.reduce(function (sum, item) {
                return sum + Number(item.dataset.fee || 0);
            }, 0);
            const percent = Number(discountInput && discountInput.value ? discountInput.value : 0);
            const discountAmount = Math.round((subtotal * percent) / 100);
            const totalAmount = Math.max(0, subtotal - discountAmount);
            if (total) total.textContent = "₹" + subtotal;
            if (discount) discount.textContent = "₹" + discountAmount;
            if (final) final.textContent = "₹" + totalAmount;

            selectedMap.clear();
            selected.forEach(function (item) {
                selectedMap.set(item.value, { id: item.value, name: item.dataset.name, fee: Number(item.dataset.fee || 0) });
            });
        }

        examOptions.addEventListener("change", updateSummary);
        if (discountInput) discountInput.addEventListener("input", updateSummary);
        updateSummary();

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const selected = Array.from(selectedMap.values());
            if (!selected.length) {
                notify("Select at least one exam before continuing.", "error");
                return;
            }

            write(STORAGE_KEYS.selectedExams, selected);
            window.location.href = "payment.html";
        });
    }

    function setupPaymentPage() {
        const form = document.getElementById("paymentForm");
        if (!form) return;

        const student = currentStudent();
        if (!student) {
            window.location.href = "login.html";
            return;
        }

        const selectedExams = read(STORAGE_KEYS.selectedExams, []);
        const selectedExamsLabel = document.getElementById("selectedExams");
        const subtotal = document.getElementById("subtotal");
        const amount = document.getElementById("amount");
        const discountText = document.getElementById("discount");
        const studentName = document.getElementById("studentName");
        const studentEmail = document.getElementById("studentEmail");

        if (selectedExams.length === 0) {
            notify("No exam is selected for payment. Please choose an exam first.", "error");
            setTimeout(function () { window.location.href = "exam.html"; }, 600);
            return;
        }

        const subtotalAmount = selectedExams.reduce(function (sum, exam) { return sum + Number(exam.fee || 0); }, 0);
        const totalAmount = subtotalAmount;

        if (selectedExamsLabel) selectedExamsLabel.textContent = selectedExams.map(function (exam) { return exam.name; }).join(", ");
        if (subtotal) subtotal.textContent = "₹" + subtotalAmount;
        if (amount) amount.textContent = "₹" + totalAmount;
        if (discountText) discountText.textContent = "₹0";
        if (studentName) studentName.value = student.name;
        if (studentEmail) studentEmail.value = student.email;

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const method = document.getElementById("paymentMethod").value;
            if (!method) {
                notify("Please choose a payment method.", "error");
                return;
            }

            let updatedStudent;
            try {
                const registration = await apiRequest("/api/students/me/registrations", {
                    method: "POST",
                    body: JSON.stringify({ courseIds: selectedExams.map(function (exam) { return exam.id; }) })
                });
                updatedStudent = { ...student, ...registration.data };
            } catch (error) {
                notify(error.message || "Unable to save your registration.", "error");
                return;
            }

            const students = read(STORAGE_KEYS.students, []);
            const studentIndex = students.findIndex(function (item) { return item.id === student.id; });

            if (studentIndex !== -1) {
                students[studentIndex] = updatedStudent;
                write(STORAGE_KEYS.students, students);
            }
            setSession("student", updatedStudent);

            write(STORAGE_KEYS.selectedExams, []);
            notify("Demo registration saved. No payment was processed.");
            setTimeout(function () {
                window.location.href = "dashboard.html";
            }, 700);
        });
    }

    async function renderAdminDashboard() {
        const studentCount = document.getElementById("adminStudents");
        const paymentCount = document.getElementById("adminPayments");
        const resultCount = document.getElementById("adminResults");
        const questionCount = document.getElementById("adminQuestions");
        const courseCount = document.getElementById("adminCourses");

        try {
            const payload = await apiRequest("/api/admin/summary", {}, function () {
                return { data: {
                    students: read(STORAGE_KEYS.students, []).length,
                    payments: read(STORAGE_KEYS.payments, []).length,
                    results: read(STORAGE_KEYS.results, []).length,
                    questions: getQuestions().length,
                    courses: getCourses().length
                } };
            });
            if (studentCount) studentCount.textContent = String(payload.data.students);
            if (paymentCount) paymentCount.textContent = String(payload.data.payments);
            if (resultCount) resultCount.textContent = String(payload.data.results);
            if (questionCount) questionCount.textContent = String(payload.data.questions);
            if (courseCount) courseCount.textContent = String(payload.data.courses);
            return;
        } catch (error) {
            notify(error.message || "Unable to load the admin summary.", "error");
        }

        const students = read(STORAGE_KEYS.students, []);
        const wallets = read(STORAGE_KEYS.payments, []);
        const results = read(STORAGE_KEYS.results, []);
        const questions = getQuestions();
        const courses = getCourses();

        if (studentCount) studentCount.textContent = String(students.length);
        if (paymentCount) paymentCount.textContent = String(wallets.length);
        if (resultCount) resultCount.textContent = String(results.length);
        if (questionCount) questionCount.textContent = String(questions.length);
        if (courseCount) courseCount.textContent = String(courses.length);
    }

    function renderCourseManagement() {
        const form = document.getElementById("courseForm");
        if (!form) return;

        const list = document.getElementById("courseList");
        if (!list) return;

        async function renderCourses() {
            let courses;
            try {
                const payload = await apiRequest("/api/courses", {}, function () { return { data: getCourses() }; });
                courses = payload.data;
                write(STORAGE_KEYS.courses, courses);
            } catch (error) {
                list.textContent = error.message || "Unable to load courses.";
                return;
            }

            list.replaceChildren(...courses.map(function (course) {
                const item = document.createElement("div");
                const details = document.createElement("div");
                const name = document.createElement("strong");
                const summary = document.createElement("p");
                const actions = document.createElement("div");
                const editButton = document.createElement("button");
                const deleteButton = document.createElement("button");
                item.className = "list-card";
                name.textContent = course.icon + " " + course.name;
                summary.textContent = course.category + " · " + course.duration + " · ₹" + course.fee;
                details.append(name, summary);
                actions.className = "list-actions";
                editButton.type = "button";
                editButton.dataset.courseEdit = course.id;
                editButton.textContent = "Edit";
                deleteButton.type = "button";
                deleteButton.className = "danger";
                deleteButton.dataset.courseDelete = course.id;
                deleteButton.textContent = "Delete";
                actions.append(editButton, deleteButton);
                item.append(details, actions);
                return item;
            }));
            if (!courses.length) {
                const empty = document.createElement("p");
                empty.className = "muted";
                empty.textContent = "No courses available.";
                list.append(empty);
            }

            document.querySelectorAll("[data-course-edit]").forEach(function (button) {
                button.addEventListener("click", function () {
                    const course = getCourses().find(function (item) { return item.id === button.dataset.courseEdit; });
                    if (!course) return;
                    document.getElementById("courseName").value = course.name;
                    document.getElementById("courseCategory").value = course.category;
                    document.getElementById("courseDuration").value = course.duration;
                    document.getElementById("courseFee").value = course.fee;
                    document.getElementById("courseIcon").value = course.icon;
                    form.dataset.editingId = course.id;
                    const title = document.getElementById("courseFormTitle");
                    if (title) title.textContent = "Edit course";
                });
            });

            document.querySelectorAll("[data-course-delete]").forEach(function (button) {
                button.addEventListener("click", async function () {
                    const courseId = button.dataset.courseDelete;
                    try {
                        await apiRequest("/api/courses/" + encodeURIComponent(courseId), { method: "DELETE" });
                    } catch (error) {
                        notify(error.message || "Unable to remove course.", "error");
                        return;
                    }
                    const coursesAfter = getCourses().filter(function (item) { return item.id !== button.dataset.courseDelete; });
                    write(STORAGE_KEYS.courses, coursesAfter);
                    await renderCourses();
                    notify("Course removed.");
                });
            });
        }

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const name = document.getElementById("courseName").value.trim();
            const category = document.getElementById("courseCategory").value.trim();
            const duration = document.getElementById("courseDuration").value.trim();
            const fee = Number(document.getElementById("courseFee").value);
            const icon = document.getElementById("courseIcon").value.trim();

            if (!name || !category || !duration || !icon || Number.isNaN(fee)) {
                notify("Please complete all course fields.", "error");
                return;
            }

            const editingId = form.dataset.editingId;
            const payload = { id: editingId || id("course_"), name, category, duration, fee, icon };

            try {
                const fields = { name, category, duration, fee, icon };
                const response = await apiRequest(
                    editingId ? "/api/courses/" + encodeURIComponent(editingId) : "/api/courses",
                    { method: editingId ? "PUT" : "POST", body: JSON.stringify(fields) }
                );
                const courses = getCourses();
                if (editingId) {
                    const index = courses.findIndex(function (item) { return item.id === editingId; });
                    if (index !== -1) courses[index] = response.data;
                } else {
                    courses.push(response.data);
                }
                write(STORAGE_KEYS.courses, courses);
            } catch (error) {
                notify(error.message || "Unable to save course.", "error");
                return;
            }

            form.reset();
            delete form.dataset.editingId;
            const title = document.getElementById("courseFormTitle");
            if (title) title.textContent = "Add a course";
            await renderCourses();
            notify(editingId ? "Course updated." : "Course added.");
        });

        document.getElementById("cancelCourseEdit")?.addEventListener("click", function () {
            form.reset();
            delete form.dataset.editingId;
            const title = document.getElementById("courseFormTitle");
            if (title) title.textContent = "Add a course";
        });

        document.getElementById("startNewCourse")?.addEventListener("click", function () {
            form.reset();
            delete form.dataset.editingId;
            const title = document.getElementById("courseFormTitle");
            if (title) title.textContent = "Add a course";
        });

        renderCourses();
    }

    function renderQuestionManagement() {
        const form = document.getElementById("questionForm");
        if (!form) return;

        const list = document.getElementById("questionList");
        if (!list) return;

        async function renderQuestions() {
            let questions;
            try {
                const payload = await apiRequest("/api/questions", {}, function () { return { data: getQuestions() }; });
                questions = payload.data;
                write(STORAGE_KEYS.questions, questions);
            } catch (error) {
                list.textContent = error.message || "Unable to load questions.";
                return;
            }

            list.replaceChildren(...questions.map(function (question) {
                const item = document.createElement("div");
                const details = document.createElement("div");
                const text = document.createElement("strong");
                const options = document.createElement("p");
                const answer = document.createElement("small");
                const deleteButton = document.createElement("button");
                item.className = "list-card";
                text.textContent = question.question;
                options.textContent = question.options.map(function (option, index) {
                    return (index + 1) + ". " + option;
                }).join("  ");
                answer.textContent = "Correct answer: Option " + question.answer;
                details.append(text, options, answer);
                deleteButton.type = "button";
                deleteButton.className = "danger";
                deleteButton.dataset.questionDelete = question.id;
                deleteButton.textContent = "Delete";
                item.append(details, deleteButton);
                return item;
            }));
            if (!questions.length) {
                const empty = document.createElement("p");
                empty.className = "muted";
                empty.textContent = "No questions saved.";
                list.append(empty);
            }

            document.querySelectorAll("[data-question-delete]").forEach(function (button) {
                button.addEventListener("click", async function () {
                    const questionId = button.dataset.questionDelete;
                    try {
                        await apiRequest("/api/questions/" + encodeURIComponent(questionId), { method: "DELETE" });
                    } catch (error) {
                        notify(error.message || "Unable to remove question.", "error");
                        return;
                    }
                    const questionsAfter = getQuestions().filter(function (item) { return item.id !== button.dataset.questionDelete; });
                    write(STORAGE_KEYS.questions, questionsAfter);
                    await renderQuestions();
                    notify("Question removed.");
                });
            });
        }

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const questionText = document.getElementById("question").value.trim();
            const options = [document.getElementById("option1").value, document.getElementById("option2").value, document.getElementById("option3").value, document.getElementById("option4").value].map(function (value) { return value.trim(); });
            const answer = Number(document.getElementById("answer").value);

            if (!questionText || options.some(function (option) { return !option; }) || !Number.isInteger(answer) || answer < 1 || answer > 4) {
                notify("Complete the question and choose a valid answer.", "error");
                return;
            }

            try {
                const payload = await apiRequest("/api/questions", {
                    method: "POST",
                    body: JSON.stringify({ question: questionText, options: options, answer: answer })
                });
                const questions = getQuestions();
                questions.push(payload.data);
                write(STORAGE_KEYS.questions, questions);
            } catch (error) {
                notify(error.message || "Unable to save question.", "error");
                return;
            }

            form.reset();
            await renderQuestions();
            notify("Question saved.");
        });

        renderQuestions();
    }

    async function renderStudentProgress() {
        const progressRows = document.getElementById("progressRows");
        if (!progressRows) return;

        let students = read(STORAGE_KEYS.students, []);
        let results = read(STORAGE_KEYS.results, []);
        try {
            const [studentPayload, resultPayload] = await Promise.all([
                apiRequest("/api/students", {}, function () { return { data: students }; }),
                apiRequest("/api/results", {}, function () { return { data: results }; })
            ]);
            students = studentPayload.data;
            results = resultPayload.data;
            write(STORAGE_KEYS.students, students);
            write(STORAGE_KEYS.results, results);
        } catch (error) {
            notify(error.message || "Unable to load student progress.", "error");
        }
        const searchable = students.map(function (student) {
            const studentResults = results.filter(function (result) { return result.studentId === student.id; });
            const last = studentResults.length ? studentResults[studentResults.length - 1] : null;
            return {
                student: student,
                score: studentResults.length ? studentResults[studentResults.length - 1].score : 0,
                percentage: studentResults.length ? studentResults[studentResults.length - 1].percentage : 0,
                status: studentResults.length ? "Completed" : "In Progress",
                attempted: studentResults.length,
                unanswered: Math.max(0, (student.registeredExams || []).length - studentResults.length),
                lastActivity: last ? new Date(last.submittedAt).toLocaleDateString() : "No submission"
            };
        });

        renderTextTable(progressRows, searchable.map(function (entry) {
            return [entry.student.name + " (" + entry.student.email + ")", (entry.student.registeredExams || []).map(function (exam) { return exam.name || exam; }).join(", "), entry.status, entry.score, entry.percentage + "%", entry.attempted, entry.unanswered, entry.lastActivity];
        }), "No student activity yet.", 8);
    }

    async function renderStudentsList() {
        const rows = document.getElementById("studentRows");
        if (!rows) return;

        let students = read(STORAGE_KEYS.students, []);
        try {
            const payload = await apiRequest("/api/students", {}, function () { return { data: students }; });
            students = payload.data;
            write(STORAGE_KEYS.students, students);
        } catch (error) {
            notify(error.message || "Unable to load students.", "error");
        }
        renderTextTable(rows, students.map(function (student) {
            return [student.name + " (" + student.id + ")", student.email, student.college, (student.registeredExams || []).length, student.paymentStatus || "Not Paid", new Date(student.createdAt).toLocaleDateString()];
        }), "No students registered yet.", 6);
    }

    async function renderPaymentsList() {
        const rows = document.getElementById("paymentRows");
        if (!rows) return;

        let payments = read(STORAGE_KEYS.payments, []);
        try {
            const payload = await apiRequest("/api/payments", {}, function () { return { data: payments }; });
            payments = payload.data;
            write(STORAGE_KEYS.payments, payments);
        } catch (error) {
            notify(error.message || "Unable to load payment records.", "error");
        }
        renderTextTable(rows, payments.map(function (payment) {
            return [payment.studentName + " (" + payment.email + ")", (payment.exams || []).map(function (exam) { return exam.name; }).join(", "), "₹" + payment.amount, payment.method, payment.status + " / " + payment.transactionId];
        }), "No payment records found.", 5);
    }

    async function renderAdminResultsList() {
        const rows = document.getElementById("adminResultRows");
        if (!rows) return;

        let results = read(STORAGE_KEYS.results, []);
        try {
            const payload = await apiRequest("/api/results", {}, function () { return { data: results }; });
            results = payload.data;
            write(STORAGE_KEYS.results, results);
        } catch (error) {
            notify(error.message || "Unable to load exam results.", "error");
        }
        renderTextTable(rows, results.map(function (result) {
            return [result.studentName, result.examName, result.score + " / " + result.total, result.percentage + "%", result.status];
        }), "No exam results yet.", 5);
    }

    function setupExamTaking() {
        const form = document.getElementById("examForm");
        if (!form) return;

        const params = new URLSearchParams(window.location.search);
        const courseId = params.get("course");
        const title = document.getElementById("examTitle");
        const questionList = document.getElementById("questionList");
        const timerLabel = document.getElementById("examTimer");
        const submitButton = document.getElementById("submitExam");

        if (!courseId) {
            notify("Choose an assessment from your dashboard first.", "error");
            return;
        }

        apiRequest("/api/exams/" + encodeURIComponent(courseId) + "/questions")
            .then(function (payload) {
                const exam = payload.data;
                if (title) title.textContent = exam.course.name;
                questionList.replaceChildren(...exam.questions.map(function (question, index) {
                    const card = document.createElement("section");
                    const heading = document.createElement("h3");
                    const number = document.createElement("p");
                    card.className = "question-card";
                    number.className = "question-number";
                    number.textContent = "QUESTION " + (index + 1);
                    heading.textContent = question.question;
                    card.append(number, heading);

                    question.options.forEach(function (option, optionIndex) {
                        const label = document.createElement("label");
                        const input = document.createElement("input");
                        input.type = "radio";
                        input.name = "answer-" + question.id;
                        input.value = String(optionIndex + 1);
                        label.className = "exam-option";
                        label.append(input, document.createTextNode(" " + option));
                        card.append(label);
                    });
                    return card;
                }));

                let remaining = Math.max(1, Number.parseInt(exam.course.duration, 10) || 30) * 60;
                const timerId = window.setInterval(function () {
                    remaining -= 1;
                    const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
                    const seconds = String(remaining % 60).padStart(2, "0");
                    timerLabel.textContent = minutes + ":" + seconds;
                    if (remaining <= 0) {
                        window.clearInterval(timerId);
                        form.requestSubmit();
                    }
                }, 1000);

                form.addEventListener("submit", async function (event) {
                    event.preventDefault();
                    if (submitButton.disabled) return;
                    submitButton.disabled = true;
                    const answers = {};
                    exam.questions.forEach(function (question) {
                        const selected = form.querySelector("input[name='answer-" + CSS.escape(question.id) + "']:checked");
                        if (selected) answers[question.id] = Number(selected.value);
                    });

                    try {
                        const response = await apiRequest("/api/exams/" + encodeURIComponent(courseId) + "/submit", {
                            method: "POST",
                            body: JSON.stringify({ answers: answers })
                        });
                        const results = read(STORAGE_KEYS.results, []);
                        results.push(response.data);
                        write(STORAGE_KEYS.results, results);
                        notify("Assessment submitted.");
                        window.location.href = "result.html";
                    } catch (error) {
                        submitButton.disabled = false;
                        notify(error.message || "Unable to submit this assessment.", "error");
                    }
                });
            })
            .catch(function (error) {
                questionList.textContent = error.message || "Unable to load this assessment.";
            });
    }

    async function initialize() {
        ensureDemoData();
        setupPasswordToggle();
        setupLogoutButtons();
        if (!await setupGuards()) return;
        setupRegister();
        setupStudentLogin();
        setupAdminLogin();

        if (document.body && document.body.dataset && document.body.dataset.guard === "student") {
            renderStudentDashboard();
            renderStudentResults();
            renderProfile();
            setupProfileForm();
            setupCourseSelection();
            setupPaymentPage();
            setupExamTaking();
        }

        if (document.body && document.body.dataset && document.body.dataset.guard === "admin") {
            renderAdminDashboard();
            renderCourseManagement();
            renderQuestionManagement();
            renderStudentProgress();
            renderStudentsList();
            renderPaymentsList();
            renderAdminResultsList();
        }
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();