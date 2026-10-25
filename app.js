(function () {
    "use strict";

    var catalog = [
        { id: "java", name: "Java Programming", category: "Development", duration: "45 min", fee: 500, icon: "☕" },
        { id: "python", name: "Python Programming", category: "Development", duration: "45 min", fee: 600, icon: "🐍" },
        { id: "web", name: "Web Development", category: "Frontend", duration: "60 min", fee: 700, icon: "◇" },
        { id: "dbms", name: "Database Management", category: "Data", duration: "40 min", fee: 400, icon: "▣" },
        { id: "cloud", name: "Cloud Computing", category: "Infrastructure", duration: "50 min", fee: 800, icon: "☁" }
    ];
    var courseApiAvailable = false;
    var collegeSuggestions = ["ABC College of Engineering", "Global Institute of Technology", "National College of Applied Sciences", "City Engineering College", "Vidyasagar Institute"];
    function normalizeCollege(value) {
        return String(value == null ? "" : value).trim();
    }
    var defaultQuestions = [
        { id: "q1", question: "Which keyword is used to inherit a class in Java?", options: ["this", "extends", "implements", "super"], answer: 2 },
        { id: "q2", question: "What is the output type of input() in Python 3?", options: ["int", "float", "str", "bool"], answer: 3 },
        { id: "q3", question: "Which HTML element is used for the largest heading?", options: ["<heading>", "<h6>", "<h1>", "<head>"], answer: 3 },
        { id: "q4", question: "Which database object stores related records?", options: ["Table", "Trigger", "View", "Index"], answer: 1 },
        { id: "q5", question: "What does IaaS stand for?", options: ["Internet as a Service", "Infrastructure as a Service", "Integration as a Service", "Information as a System"], answer: 2 }
    ];

    function read(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (error) { return fallback; }
    }
    function write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
    async function loadCatalog() {
        try {
            var response = await fetch("api/courses");
            if (!response.ok) throw new Error("Course API returned HTTP " + response.status + ".");
            var payload = await response.json();
            if (!payload || !Array.isArray(payload.data)) throw new Error("Course API returned invalid course data.");
            catalog = payload.data;
            courseApiAvailable = true;
            write("courses", catalog);
        } catch (error) {
            courseApiAvailable = false;
            var savedCourses = read("courses", null);
            catalog = Array.isArray(savedCourses) ? savedCourses : catalog;
        }
    }
    async function courseRequest(method, courseId, data) {
        var options = { method: method, headers: {} };
        if (data) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(data);
        }
        var response = await fetch("api/courses" + (courseId ? "/" + encodeURIComponent(courseId) : ""), options);
        if (!response.ok) {
            var payload = await response.json().catch(function () { return {}; });
            throw new Error(payload.error || "Course request failed with HTTP " + response.status + ".");
        }
        return response.status === 204 ? null : (await response.json()).data;
    }
    function id(prefix) {
        return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }
    function text(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
        });
    }
    function money(value) { return "₹" + Number(value || 0).toLocaleString("en-IN"); }
    function currentStudent() { return read("currentStudent", null); }
    function saveStudent(student) {
        var students = read("students", []);
        var index = students.findIndex(function (item) { return item.email === student.email; });
        if (index < 0) { students.push(student); } else { students[index] = student; }
        write("students", students);
        write("currentStudent", student);
    }
    function saveProgress(progress) {
        var records = read("studentProgress", []);
        var index = records.findIndex(function (item) {
            return item.email === progress.email && item.exam === progress.exam;
        });
        if (index < 0) records.push(progress); else records[index] = progress;
        write("studentProgress", records);
    }
    function notify(message, type) {
        var toast = document.getElementById("toast");
        if (!toast) { alert(message); return; }
        toast.textContent = message;
        toast.className = "toast show " + (type || "success");
        window.setTimeout(function () { toast.className = "toast"; }, 3200);
    }
    function guard() {
        var guardType = document.body.getAttribute("data-guard");
        if (guardType === "student" && !currentStudent()) {
            window.location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop());
            return false;
        }
        if (guardType === "admin" && localStorage.getItem("adminLogin") !== "true") {
            window.location.href = "admin-login.html";
            return false;
        }
        return true;
    }
    function bindLogout() {
        document.querySelectorAll("[data-logout]").forEach(function (link) {
            link.addEventListener("click", function (event) {
                event.preventDefault();
                localStorage.removeItem("currentStudent");
                localStorage.removeItem("adminLogin");
                window.location.href = "index.html";
            });
        });
        var toggle = document.querySelector(".nav-toggle");
        var links = document.querySelector(".nav-links");
        if (toggle && links) { toggle.addEventListener("click", function () { links.classList.toggle("open"); }); }
    }
    function setupRegister() {
        var form = document.getElementById("registerForm");
        if (!form) return;
        if (currentStudent()) { window.location.href = "dashboard.html"; return; }
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var name = document.getElementById("name").value.trim();
            var email = document.getElementById("email").value.trim().toLowerCase();
            var phone = document.getElementById("phone").value.replace(/\D/g, "");
            var college = normalizeCollege(document.getElementById("college").value);
            var password = document.getElementById("password").value;
            var confirm = document.getElementById("confirmPassword").value;
            if (name.length < 2 || !/^[0-9]{10}$/.test(phone)) return notify("Enter a valid 10-digit Indian phone number.", "error");
            if (!college) return notify("Select or enter your college name.", "error");
            if (college.length < 2) return notify("Enter a valid college name.", "error");
            if (password.length < 6) return notify("Password must be at least 6 characters.", "error");
            if (password !== confirm) return notify("Passwords do not match.", "error");
            var students = read("students", []);
            if (students.some(function (student) { return student.email === email; })) return notify("An account with this email already exists.", "error");
            var student = { id: id("stu_"), name: name, email: email, phone: "+91 " + phone, college: college, password: password, registeredExams: [], paymentStatus: "Not Paid", createdAt: new Date().toISOString() };
            students.push(student);
            write("students", students);
            notify("Account created. You can now sign in.");
            window.setTimeout(function () { window.location.href = "login.html"; }, 700);
        });
    }
    function setupLogin() {
        var form = document.getElementById("loginForm");
        if (!form) return;
        if (currentStudent()) { window.location.href = "dashboard.html"; return; }
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var email = document.getElementById("email").value.trim().toLowerCase();
            var password = document.getElementById("password").value;
            var student = read("students", []).find(function (item) { return item.email === email && item.password === password; });
            if (!student) return notify("Email or password is incorrect.", "error");
            write("currentStudent", student);
            var next = new URLSearchParams(location.search).get("next");
            window.location.href = next || "dashboard.html";
        });
    }
    function setupAdminLogin() {
        var form = document.getElementById("adminLoginForm");
        if (!form) return;
        if (localStorage.getItem("adminLogin") === "true") { window.location.href = "admin-dashboard.html"; return; }
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var username = document.getElementById("adminUsername").value.trim().toLowerCase();
            var password = document.getElementById("adminPassword").value;
            if ((username === "admin" || username === "admine" || username === "admin@onlineexam.com") && password === "admin123") {
                localStorage.setItem("adminLogin", "true");
                window.location.href = "admin-dashboard.html";
            } else notify("Use admin / admin123 to access the demo panel.", "error");
        });
    }
    function setupPasswordToggles() {
        document.querySelectorAll("[data-toggle-password]").forEach(function (button) {
            button.addEventListener("click", function () {
                var input = document.getElementById(button.getAttribute("data-toggle-password"));
                if (!input) return;
                var showing = input.type === "text";
                input.type = showing ? "password" : "text";
                button.textContent = showing ? "Show" : "Hide";
                button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
            });
        });
    }
    function setupDashboard() {
        var student = currentStudent();
        if (!student) return;
        var results = read("results", []).filter(function (result) { return result.email === student.email; });
        var exams = student.registeredExams || [];
        var set = function (idValue, value) {
            var element = document.getElementById(idValue);
            if (!element) return;
            if (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT") element.value = value;
            else element.textContent = value;
        };
        set("welcomeName", student.name.split(" ")[0]);
        set("registeredCount", exams.length);
        set("completedCount", results.length);
        set("averageScore", results.length ? Math.round(results.reduce(function (sum, result) { return sum + Number(result.percentage); }, 0) / results.length) + "%" : "—");
        set("paymentState", student.paymentStatus === "Paid" ? "Paid" : "Pending");
        var list = document.getElementById("upcomingList");
        if (list) list.innerHTML = exams.length ? exams.map(function (exam) { return "<li><span>" + text(exam) + "</span><a href=\"exam.html?exam=" + encodeURIComponent(exam) + "\">Start when ready →</a></li>"; }).join("") : "<li class=\"empty-state\">No exams registered yet. <a href=\"exam.html\">Browse exams</a></li>";
    }
    function setupExamRegistration() {
        var grid = document.getElementById("examOptions");
        if (!grid) return;
        var student = currentStudent();
        var selected = read("examCart", []);
        grid.innerHTML = catalog.map(function (exam) {
            var checked = selected.some(function (item) { return item && (item.id === exam.id || item === exam.id || item.name === exam.name); });
            return "<label class=\"exam-option\"><input type=\"checkbox\" class=\"exam-choice\" value=\"" + text(exam.id) + "\" " + (checked ? "checked" : "") + "><span class=\"exam-icon\">" + text(exam.icon) + "</span><span class=\"exam-info\"><strong>" + text(exam.name) + "</strong><small>" + text(exam.category) + " · " + text(exam.duration) + "</small></span><b>" + money(exam.fee) + "</b></label>";
        }).join("");
        var courseCount = document.getElementById("courseCount");
        if (courseCount) courseCount.textContent = catalog.length + (catalog.length === 1 ? " subject" : " subjects");
        if (!catalog.length) grid.innerHTML = "<p class=\"empty-state\">No courses are available right now. Please check back later.</p>";
        var discount = document.getElementById("discountPercent");
        var total = document.getElementById("total");
        var discountAmount = document.getElementById("discount");
        var finalAmount = document.getElementById("final");
        function calculate() {
            var choices = Array.from(document.querySelectorAll(".exam-choice:checked")).map(function (input) { return catalog.find(function (exam) { return exam.id === input.value; }); }).filter(Boolean);
            var subtotal = choices.reduce(function (sum, exam) { return sum + exam.fee; }, 0);
            var percent = Math.min(100, Math.max(0, Number(discount && discount.value) || 0));
            var reduction = subtotal * percent / 100;
            if (total) total.textContent = money(subtotal);
            if (discountAmount) discountAmount.textContent = money(reduction);
            if (finalAmount) finalAmount.textContent = money(subtotal - reduction);
            return { choices: choices, subtotal: subtotal, discount: reduction, amount: subtotal - reduction };
        }
        function updateSelection() {
            grid.querySelectorAll(".exam-option").forEach(function (option) {
                var input = option.querySelector(".exam-choice");
                option.classList.toggle("selected", Boolean(input && input.checked));
            });
            calculate();
        }
        grid.addEventListener("change", updateSelection);
        if (discount) discount.addEventListener("input", calculate);
        updateSelection();
        var form = document.getElementById("registrationForm");
        if (form) form.addEventListener("submit", function (event) {
            event.preventDefault();
            var details = calculate();
            if (!student) return notify("Please sign in to register for an exam.", "error");
            if (!details.choices.length) return notify("Choose at least one exam.", "error");
            write("examCart", details.choices.map(function (exam) { return exam; }));
            write("pendingPayment", { email: student.email, exams: details.choices.map(function (exam) { return exam.name; }), subtotal: details.subtotal, discount: details.discount, amount: details.amount, createdAt: new Date().toISOString() });
            window.location.href = "payment.html";
        });
    }
    function setupPayment() {
        var form = document.getElementById("paymentForm");
        if (!form) return;
        var student = currentStudent();
        var pending = read("pendingPayment", null);
        if (!student || !pending || pending.email !== student.email) {
            notify("Select an exam before continuing to payment.", "error");
            window.setTimeout(function () { window.location.href = "exam.html"; }, 500);
            return;
        }
        var set = function (idValue, value) {
            var element = document.getElementById(idValue);
            if (!element) return;
            if (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT") element.value = value;
            else element.textContent = value;
        };
        set("studentName", student.name); set("studentEmail", student.email); set("amount", money(pending.amount));
        set("subtotal", money(pending.subtotal)); set("discount", money(pending.discount));
        set("selectedExams", pending.exams.join(", "));
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var name = document.getElementById("studentName").value.trim();
            var email = document.getElementById("studentEmail").value.trim().toLowerCase();
            var method = document.getElementById("paymentMethod").value;
            var transactionId = "TXN-" + Date.now().toString().slice(-8);
            if (!name) return notify("Enter the student name.", "error");
            if (!email) return notify("Enter the email address.", "error");
            if (!method) return notify("Select a payment method.", "error");
            var payment = { id: id("pay_"), email: email, name: name, exams: pending.exams, amount: pending.amount, method: method, status: "Paid", paymentStatus: "Paid", transactionId: transactionId, date: new Date().toISOString() };
            var payments = read("payments", []); payments.push(payment); write("payments", payments);
            var registrations = read("examRegistrations", []); registrations.push({ id: id("reg_"), email: email, name: name, exams: pending.exams, amount: pending.amount, status: "Paid", paymentId: payment.id, date: payment.date }); write("examRegistrations", registrations);
            student.registeredExams = Array.from(new Set((student.registeredExams || []).concat(pending.exams)));
            student.paymentStatus = "Paid"; student.transactionId = transactionId; student.paymentMethod = method; student.amountPaid = pending.amount;
            saveStudent(student); localStorage.removeItem("pendingPayment"); localStorage.removeItem("examCart");
            notify("Payment successful.");
            window.setTimeout(function () { window.location.href = "dashboard.html"; }, 650);
        });
    }
    function setupProfile() {
        var student = currentStudent(); if (!student) return;
        var set = function (idValue, value) { var element = document.getElementById(idValue); if (element) element.textContent = value || "—"; };
        set("profileName", student.name); set("profileEmail", student.email); set("profilePhone", student.phone); set("profileCollege", student.college); set("paymentStatus", student.paymentStatus);
        set("transactionId", student.transactionId); set("profilePaymentMethod", student.paymentMethod);
        var avatar = document.getElementById("profileAvatar");
        if (avatar) {
            avatar.textContent = (student.name || "S").charAt(0).toUpperCase();
            avatar.style.backgroundImage = student.profilePhoto ? "url('" + student.profilePhoto + "')" : "";
            avatar.style.backgroundPosition = "center"; avatar.style.backgroundSize = "cover";
            avatar.style.color = student.profilePhoto ? "transparent" : "";
        }
        var exams = document.getElementById("profileExams");
        if (exams) exams.innerHTML = (student.registeredExams || []).map(function (exam) { return "<span class=\"tag\">" + text(exam) + "</span>"; }).join("") || "<span class=\"muted\">No exams registered</span>";
        var photoUpload = document.getElementById("photoUpload");
        if (photoUpload && !photoUpload.dataset.bound) {
            photoUpload.dataset.bound = "true";
            photoUpload.addEventListener("change", function () {
                var file = photoUpload.files[0];
                if (!file) return;
                if (!file.type.match(/^image\//) || file.size > 2 * 1024 * 1024) {
                    photoUpload.value = ""; return notify("Choose an image smaller than 2 MB.", "error");
                }
                var reader = new FileReader();
                reader.onload = function () { student.profilePhoto = reader.result; saveStudent(student); setupProfile(); notify("Profile photo updated."); };
                reader.readAsDataURL(file);
            });
        }
        var form = document.getElementById("profileForm");
        if (form && !form.dataset.bound) {
            form.dataset.bound = "true";
            document.getElementById("editName").value = student.name; document.getElementById("editPhone").value = (student.phone || "").replace(/\D/g, "").slice(-10);
            var editCollege = document.getElementById("editCollege"); if (editCollege) editCollege.value = student.college || "";
            form.addEventListener("submit", function (event) {
                event.preventDefault();
                var name = document.getElementById("editName").value.trim();
                var phone = document.getElementById("editPhone").value.replace(/\D/g, "");
                var college = normalizeCollege(document.getElementById("editCollege").value);
                if (name.length < 2 || !/^[0-9]{10}$/.test(phone)) return notify("Enter a valid name and 10-digit phone number.", "error");
                if (!college) return notify("Select or enter your college name.", "error");
                student.name = name;
                student.phone = "+91 " + phone;
                student.college = college;
                saveStudent(student);
                notify("Profile updated.");
                setupProfile();
            });
        }
    }
    function setupResult() {
        var student = currentStudent(); if (!student) return;
        var results = read("results", []).filter(function (result) { return result.email === student.email; }).reverse();
        var body = document.getElementById("resultRows"); if (!body) return;
        body.innerHTML = results.length ? results.map(function (result) { return "<tr><td>" + text(result.exam || "Online assessment") + "</td><td>" + result.score + "/" + result.total + "</td><td>" + result.percentage + "%</td><td><span class=\"status " + (result.status === "Pass" ? "success" : "danger") + "\">" + result.status + "</span></td><td>" + new Date(result.date).toLocaleDateString() + "</td></tr>"; }).join("") : "<tr><td colspan=\"5\" class=\"empty-state\">No results yet. Complete an exam to see your score.</td></tr>";
    }
    function setupExam() {
        var questions = read("questions", defaultQuestions), student = currentStudent();
        if (!questions.length) { notify("No questions are available yet.", "error"); return; }
        var container = document.getElementById("questionContainer"); if (!container) return;
        var examName = new URLSearchParams(location.search).get("exam") || "Online assessment";
        var startedAt = new Date().toISOString();
        saveProgress({
            email: student.email,
            name: student.name,
            college: student.college || "",
            exam: examName,
            status: "In Progress",
            score: null,
            percentage: null,
            attempted: 0,
            unanswered: questions.length,
            total: questions.length,
            startedAt: startedAt,
            completedAt: null
        });
        container.innerHTML = questions.map(function (question, index) {
            return "<article class=\"question-card\"><div class=\"question-number\">Q" + (index + 1) + "</div><h3>" + text(question.question) + "</h3><div class=\"option-grid\">" + question.options.map(function (option, optionIndex) { return "<label><input type=\"radio\" name=\"question" + index + "\" value=\"" + optionIndex + "\"><span>" + String.fromCharCode(65 + optionIndex) + "</span>" + text(option) + "</label>"; }).join("") + "</div></article>";
        }).join("");
        var seconds = 30 * 60, timer = document.getElementById("timer"), submitted = false;
        function submitExam() {
            if (submitted) return; submitted = true;
            var score = questions.reduce(function (sum, question, index) { var answer = document.querySelector("input[name=\"question" + index + "\"]:checked"); return sum + (answer && Number(answer.value) === Number(question.answer) - 1 ? 1 : 0); }, 0);
            var percentage = questions.length ? (score / questions.length * 100).toFixed(2) : "0.00";
            var completedAt = new Date().toISOString();
            var result = { id: id("res_"), email: student.email, name: student.name, exam: examName, score: score, total: questions.length, percentage: percentage, status: Number(percentage) >= 40 ? "Pass" : "Fail", date: completedAt };
            var results = read("results", []); results.push(result); write("results", results); write("examResult", result);
            saveProgress({
                email: student.email,
                name: student.name,
                college: student.college || "",
                exam: examName,
                status: "Completed",
                score: score,
                percentage: percentage,
                attempted: questions.filter(function (question, questionIndex) {
                    return document.querySelector("input[name=\"question" + questionIndex + "\"]:checked");
                }).length,
                unanswered: questions.length - questions.filter(function (question, questionIndex) {
                    return document.querySelector("input[name=\"question" + questionIndex + "\"]:checked");
                }).length,
                total: questions.length,
                startedAt: startedAt,
                completedAt: completedAt
            });
            notify("Exam submitted successfully."); window.setTimeout(function () { window.location.href = "result.html"; }, 650);
        }
        window.submitExam = submitExam;
        var interval = window.setInterval(function () { var minutes = Math.floor(seconds / 60), remainder = seconds % 60; if (timer) timer.textContent = minutes + ":" + (remainder < 10 ? "0" : "") + remainder; if (seconds-- <= 0) { window.clearInterval(interval); submitExam(); } }, 1000);
        var form = document.getElementById("examForm"); if (form) form.addEventListener("submit", function (event) { event.preventDefault(); if (confirm("Submit your exam now?")) submitExam(); });
    }
    function setupAdminDashboard() {
        var students = read("students", []), payments = read("payments", []), results = read("results", []), questions = read("questions", defaultQuestions);
        [["adminStudents", students.length], ["adminPayments", payments.length], ["adminResults", results.length], ["adminQuestions", questions.length]].forEach(function (item) { var element = document.getElementById(item[0]); if (element) element.textContent = item[1]; });
        var courseCount = document.getElementById("adminCourses");
        if (courseCount) courseCount.textContent = catalog.length;
    }
    function setupCourses() {
        var form = document.getElementById("courseForm");
        var list = document.getElementById("courseList");
        if (!form || !list) return;
        var editingId = null;
        var submitButton = form.querySelector("button[type=\"submit\"]");
        var cancelButton = document.getElementById("cancelCourseEdit");
        var formTitle = document.getElementById("courseFormTitle");
        var notice = document.getElementById("courseStorageNotice");
        if (notice && !courseApiAvailable) notice.textContent = "The Express API is unavailable. Changes on this page will be saved in this browser only.";

        function resetForm() {
            editingId = null;
            form.reset();
            formTitle.textContent = "Add a course";
            submitButton.textContent = "Add course";
            cancelButton.textContent = "Clear form";
        }
        function render() {
            list.innerHTML = catalog.length ? catalog.map(function (course) {
                return "<article class=\"question-admin\"><div><strong><span class=\"course-list-icon\">" + text(course.icon) + "</span>" + text(course.name) + "</strong><p>" + text(course.category) + " · " + text(course.duration) + " · " + money(course.fee) + "</p></div><div class=\"question-actions\"><button class=\"btn btn-ghost\" type=\"button\" data-edit-course=\"" + text(course.id) + "\">Edit</button><button class=\"btn btn-ghost danger-text\" type=\"button\" data-delete-course=\"" + text(course.id) + "\">Delete</button></div></article>";
            }).join("") : "<p class=\"empty-state\">No courses yet. Add one using the form.</p>";
            list.querySelectorAll("[data-edit-course]").forEach(function (button) {
                button.addEventListener("click", function () {
                    var course = catalog.find(function (item) { return item.id === button.getAttribute("data-edit-course"); });
                    if (!course) return;
                    editingId = course.id;
                    document.getElementById("courseName").value = course.name;
                    document.getElementById("courseCategory").value = course.category;
                    document.getElementById("courseDuration").value = course.duration;
                    document.getElementById("courseFee").value = course.fee;
                    document.getElementById("courseIcon").value = course.icon;
                    formTitle.textContent = "Edit course";
                    submitButton.textContent = "Update course";
                    cancelButton.textContent = "Cancel edit";
                    document.getElementById("courseName").focus();
                });
            });
            list.querySelectorAll("[data-delete-course]").forEach(function (button) {
                button.addEventListener("click", async function () {
                    var courseId = button.getAttribute("data-delete-course");
                    var course = catalog.find(function (item) { return item.id === courseId; });
                    if (!course || !window.confirm("Delete " + course.name + "? This will remove it from the available courses.")) return;
                    try {
                        if (courseApiAvailable) await courseRequest("DELETE", courseId);
                        catalog = catalog.filter(function (item) { return item.id !== courseId; });
                        write("courses", catalog);
                        if (editingId === courseId) resetForm();
                        render();
                        notify(courseApiAvailable ? "Course deleted." : "Course deleted in this browser.");
                    } catch (error) {
                        notify(error.message, "error");
                    }
                });
            });
        }
        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            var wasEditing = Boolean(editingId);
            var course = {
                name: document.getElementById("courseName").value.trim(),
                category: document.getElementById("courseCategory").value.trim(),
                duration: document.getElementById("courseDuration").value.trim(),
                fee: Number(document.getElementById("courseFee").value),
                icon: document.getElementById("courseIcon").value.trim()
            };
            if (!course.name || !course.category || !course.duration || !course.icon || !Number.isFinite(course.fee) || course.fee < 0) {
                return notify("Complete all course fields and enter a valid fee.", "error");
            }
            if (catalog.some(function (item) { return item.name.toLowerCase() === course.name.toLowerCase() && item.id !== editingId; })) {
                return notify("A course with this name already exists.", "error");
            }
            try {
                if (courseApiAvailable) {
                    var saved = await courseRequest(editingId ? "PUT" : "POST", editingId, course);
                    if (editingId) catalog = catalog.map(function (item) { return item.id === editingId ? saved : item; });
                    else catalog.push(saved);
                } else if (editingId) {
                    catalog = catalog.map(function (item) { return item.id === editingId ? Object.assign({}, item, course) : item; });
                } else {
                    catalog.push(Object.assign({ id: id("course_") }, course));
                }
                write("courses", catalog);
                resetForm();
                render();
                notify(wasEditing ? "Course updated." : "Course added.");
            } catch (error) {
                notify(error.message, "error");
            }
        });
        if (cancelButton) cancelButton.addEventListener("click", resetForm);
        var startNewCourseButton = document.getElementById("startNewCourse");
        if (startNewCourseButton) startNewCourseButton.addEventListener("click", function () {
            resetForm();
            document.getElementById("courseName").focus();
        });
        render();
    }
    function setupQuestions() {
        var form = document.getElementById("questionForm"), list = document.getElementById("questionList"), questions = read("questions", defaultQuestions);
        var editingId = null;
        function render() {
            write("questions", questions);
            list.innerHTML = questions.length ? questions.map(function (q, index) { return "<article class=\"question-admin\"><div><strong>Q" + (index + 1) + ". " + text(q.question) + "</strong><p>" + q.options.map(function (option, i) { return String.fromCharCode(65 + i) + ". " + text(option); }).join(" · ") + "</p><small>Correct answer: " + String.fromCharCode(64 + Number(q.answer)) + "</small></div><div class=\"question-actions\"><button class=\"btn btn-ghost\" data-edit-question=\"" + q.id + "\">Edit</button><button class=\"btn btn-ghost danger-text\" data-delete-question=\"" + q.id + "\">Delete</button></div></article>"; }).join("") : "<p class=\"empty-state\">No questions yet.</p>";
            list.querySelectorAll("[data-edit-question]").forEach(function (button) { button.addEventListener("click", function () {
                var question = questions.find(function (item) { return item.id === button.getAttribute("data-edit-question"); });
                if (!question) return;
                editingId = question.id;
                document.getElementById("question").value = question.question;
                question.options.forEach(function (option, index) { document.getElementById("option" + (index + 1)).value = option; });
                document.getElementById("answer").value = question.answer;
                document.querySelector("#questionForm button[type=\"submit\"]").textContent = "Update question";
                document.getElementById("question").focus();
            }); });
            list.querySelectorAll("[data-delete-question]").forEach(function (button) { button.addEventListener("click", function () { questions = questions.filter(function (q) { return q.id !== button.getAttribute("data-delete-question"); }); render(); }); });
        }
        if (!form || !list) return; render();
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var questionText = document.getElementById("question").value.trim();
            var options = [1, 2, 3, 4].map(function (n) { return document.getElementById("option" + n).value.trim(); });
            var answer = Number(document.getElementById("answer").value);
            if (!questionText || options.some(function (option) { return !option; }) || !answer) return notify("Complete the question, all four options, and the correct answer.", "error");
            if (editingId) {
                var existing = questions.find(function (question) { return question.id === editingId; });
                if (existing) { existing.question = questionText; existing.options = options; existing.answer = answer; }
                editingId = null;
                notify("Question updated.");
            } else {
                questions.push({ id: id("q_"), question: questionText, options: options, answer: answer });
                notify("Question added.");
            }
            form.reset();
            document.querySelector("#questionForm button[type=\"submit\"]").textContent = "Save question";
            render();
        });
    }
    function setupAdminTables() {
        var students = read("students", []), payments = read("payments", []), results = read("results", []);
        var studentTable = document.getElementById("studentRows");
        var collegeFilter = document.getElementById("studentCollegeFilter");
        if (collegeFilter) {
            var colleges = Array.from(new Set(students.map(function (student) { return normalizeCollege(student.college); }).filter(Boolean))).sort();
            var selectedCollege = collegeFilter.value || "All";
            collegeFilter.innerHTML = "<option value=\"All\">All colleges</option>" + colleges.map(function (college) { return "<option value=\"" + text(college) + "\">" + text(college) + "</option>"; }).join("");
            if (colleges.indexOf(selectedCollege) >= 0) collegeFilter.value = selectedCollege; else collegeFilter.value = "All";
        }
        var selectedCollege = collegeFilter ? collegeFilter.value : "All";
        var filteredStudents = students.filter(function (student) { return selectedCollege === "All" || normalizeCollege(student.college) === selectedCollege; });
        if (studentTable) studentTable.innerHTML = filteredStudents.length ? filteredStudents.map(function (student) { return "<tr><td>" + text(student.name) + "</td><td>" + text(student.email) + "</td><td>" + text(student.college || "—") + "</td><td>" + ((student.registeredExams || []).length || 0) + "</td><td><span class=\"status " + (student.paymentStatus === "Paid" ? "success" : "warning") + "\">" + text(student.paymentStatus || "Not Paid") + "</span></td><td>" + new Date(student.createdAt || Date.now()).toLocaleDateString() + "</td></tr>"; }).join("") : "<tr><td colspan=\"6\" class=\"empty-state\">No students registered.</td></tr>";
        var paymentTable = document.getElementById("paymentRows");
        if (paymentTable) paymentTable.innerHTML = payments.length ? payments.slice().reverse().map(function (payment) { return "<tr><td>" + text(payment.name) + "<small>" + text(payment.email) + "</small></td><td>" + text(payment.exams.join(", ")) + "</td><td>" + money(payment.amount) + "</td><td>" + text(payment.method) + "</td><td><span class=\"status success\">Paid</span><small>" + text(payment.transactionId) + "</small></td></tr>"; }).join("") : "<tr><td colspan=\"5\" class=\"empty-state\">No payments recorded.</td></tr>";
        var resultTable = document.getElementById("adminResultRows");
        if (resultTable) resultTable.innerHTML = results.length ? results.slice().reverse().map(function (result) { return "<tr><td>" + text(result.name) + "<small>" + text(result.email) + "</small></td><td>" + text(result.exam) + "</td><td>" + result.score + "/" + result.total + "</td><td>" + result.percentage + "%</td><td><span class=\"status " + (result.status === "Pass" ? "success" : "danger") + "\">" + result.status + "</span></td></tr>"; }).join("") : "<tr><td colspan=\"5\" class=\"empty-state\">No exam results yet.</td></tr>";
    }
    function setupStudentProgress() {
        var table = document.getElementById("progressRows");
        if (!table) return;
        var search = document.getElementById("progressSearch");
        var filter = document.getElementById("progressFilter");
        var collegeFilter = document.getElementById("collegeFilter");
        function formatDate(value) {
            return value ? new Date(value).toLocaleString("en-IN") : "?";
        }
        function buildCollegeOptions() {
            if (!collegeFilter) return;
            var colleges = Array.from(new Set(read("students", []).map(function (student) { return normalizeCollege(student.college); }).concat(read("studentProgress", []).map(function (record) { return normalizeCollege(record.college); })).filter(Boolean))).sort();
            var selected = collegeFilter.value || "All";
            collegeFilter.innerHTML = "<option value=\"All\">All colleges</option>" + colleges.map(function (college) { return "<option value=\"" + text(college) + "\">" + text(college) + "</option>"; }).join("");
            if (colleges.indexOf(selected) >= 0) collegeFilter.value = selected; else collegeFilter.value = "All";
        }
        function render() {
            buildCollegeOptions();
            var query = (search && search.value || "").trim().toLowerCase();
            var status = filter && filter.value || "All";
            var selectedCollege = collegeFilter && collegeFilter.value || "All";
            var records = read("studentProgress", []).filter(function (record) {
                var matchesText = !query || [record.name, record.email, record.exam].join(" ").toLowerCase().indexOf(query) >= 0;
                var matchesCollege = selectedCollege === "All" || normalizeCollege(record.college) === selectedCollege;
                return matchesText && matchesCollege && (status === "All" || record.status === status);
            }).sort(function (a, b) {
                return new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0);
            });
            table.innerHTML = records.length ? records.map(function (record) {
                var statusClass = record.status === "Completed" ? "success" : record.status === "In Progress" ? "warning" : "danger";
                return "<tr><td><strong>" + text(record.name) + "</strong><small>" + text(record.email) + "</small></td><td>" + text(record.exam) + "</td><td><span class=\"status " + statusClass + "\">" + text(record.status) + "</span></td><td>" + (record.score == null ? "?" : record.score + "/" + record.total) + "</td><td>" + (record.percentage == null ? "?" : record.percentage + "%") + "</td><td>" + record.attempted + "/" + record.total + "</td><td>" + (record.unanswered == null ? "?" : record.unanswered) + "</td><td>" + formatDate(record.completedAt || record.startedAt) + "</td></tr>";
            }).join("") : "<tr><td colspan=\"8\" class=\"empty-state\">No progress records match your search.</td></tr>";
        }
        if (search) search.addEventListener("input", render);
        if (filter) filter.addEventListener("change", render);
        if (collegeFilter) collegeFilter.addEventListener("change", render);
        render();
    }
    async function init() {
        await loadCatalog();
        var savedQuestions = read("questions", null);
        if (!Array.isArray(savedQuestions) || !savedQuestions.length) savedQuestions = defaultQuestions.map(function (question) { return Object.assign({}, question, { options: question.options.slice() }); });
        savedQuestions = savedQuestions.map(function (question) {
            return { id: question.id || id("q_"), question: question.question || "", options: Array.isArray(question.options) ? question.options : ["Option A", "Option B", "Option C", "Option D"], answer: Number(question.answer) || 1 };
        });
        write("questions", savedQuestions);
        var savedResults = read("results", []);
        var legacyResult = read("examResult", null), legacyStudent = currentStudent();
        if (!savedResults.length && legacyResult && legacyStudent) {
            savedResults = [{ id: id("res_"), email: legacyStudent.email, name: legacyStudent.name, exam: "Online assessment", score: Number(legacyResult.score) || 0, total: Number(legacyResult.total) || 0, percentage: legacyResult.percentage || "0.00", status: legacyResult.status || "Fail", date: new Date().toISOString() }];
        }
        write("payments", read("payments", [])); write("examRegistrations", read("examRegistrations", [])); write("results", savedResults); write("students", read("students", [])); write("studentProgress", read("studentProgress", []));
        if (!guard()) return; bindLogout();
        setupRegister(); setupLogin(); setupAdminLogin(); setupPasswordToggles(); setupDashboard(); setupExamRegistration(); setupPayment(); setupProfile(); setupResult(); setupExam(); setupAdminDashboard(); setupQuestions(); setupCourses(); setupAdminTables(); setupStudentProgress();
    }
    document.addEventListener("DOMContentLoaded", function () {
        init().catch(function (error) {
            console.error("Unable to initialize Examly:", error);
            notify("Unable to load the application. Please refresh and try again.", "error");
        });
    });
}());
