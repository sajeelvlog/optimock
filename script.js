// REALTIME SYSTEM STATE
let extractedPDFText = "";
let masterQuestionPool = [];
let activeStudentQuestions = [];
let currentQuestionIndex = 0;
let studentAnswers = [];
let timerInterval = null;
let elapsedSeconds = 0;
let activeMode = "practice";
let currentLoggedInUser = null;
let activeSessionExam = null;
let registeredStudents = [];
let studentExamResults = [];
let examArchives = [];
let publishedExam = null;
let database = null;
let firebaseApi = null;
let portalIsReady = false;
let isSubmitting = false;

const DATABASE_ROOT = "optimPortal";

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("login-form").addEventListener("submit", handleLogin);
    connectRealtimeDatabase();
});

async function connectRealtimeDatabase() {
    if (!isFirebaseConfigured()) {
        showConnectionMessage("Finish the Firebase setup in firebase-config.js, then reload this page.", "var(--danger)");
        return;
    }

    try {
        const modules = await Promise.all([
            import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
            import("https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js")
        ]);

        const appModule = modules[0];
        firebaseApi = modules[1];
        const firebaseApp = appModule.initializeApp(window.firebaseConfig);
        database = firebaseApi.getDatabase(firebaseApp);

        await firebaseApi.runTransaction(portalRef(), currentData => {
            return currentData || createInitialPortalData();
        });

        const initialSnapshot = await firebaseApi.get(portalRef());
        const initialData = initialSnapshot.val() || {};
        registeredStudents = collectionValues(initialData.students);
        masterQuestionPool = collectionValues(initialData.masterQuestionPool);
        publishedExam = initialData.publishedExam || null;
        examArchives = collectionValues(initialData.examArchives);
        studentExamResults = collectionValues(initialData.examResults);

        subscribeToRealtimeData();
        portalIsReady = true;
        showConnectionMessage("Live sync connected. Changes now appear on every open device.", "var(--success)");
    } catch (error) {
        console.error("Firebase connection failed:", error);
        showConnectionMessage("Could not connect to Firebase. Check the settings in firebase-config.js.", "var(--danger)");
    }
}

function isFirebaseConfigured() {
    const config = window.firebaseConfig;
    return Boolean(
        config &&
        config.apiKey &&
        config.databaseURL &&
        !config.apiKey.includes("PASTE_") &&
        !config.databaseURL.includes("PASTE_")
    );
}

function createInitialPortalData() {
    return {
        students: {
            "9876543210": { name: "Rahul Sharma", phone: "9876543210", pass: "123456" },
            "9123456789": { name: "Ananya Nair", phone: "9123456789", pass: "123456" }
        },
        masterQuestionPool: [],
        examArchives: {},
        examResults: {}
    };
}

function portalRef(path = "") {
    const fullPath = path ? DATABASE_ROOT + "/" + path : DATABASE_ROOT;
    return firebaseApi.ref(database, fullPath);
}

function subscribeToRealtimeData() {
    firebaseApi.onValue(portalRef("students"), snapshot => {
        registeredStudents = collectionValues(snapshot.val());
        if (isVisible("admin-screen")) renderRegisteredStudents();
    }, handleRealtimeReadError);

    firebaseApi.onValue(portalRef("masterQuestionPool"), snapshot => {
        masterQuestionPool = collectionValues(snapshot.val());
        const previewCount = document.getElementById("preview-count");
        if (previewCount) previewCount.innerText = masterQuestionPool.length;
    }, handleRealtimeReadError);

    firebaseApi.onValue(portalRef("publishedExam"), snapshot => {
        publishedExam = snapshot.val() || null;
        if (
            isVisible("student-screen") &&
            activeMode === "exam" &&
            !isVisible("quiz-container") &&
            !isVisible("review-container")
        ) {
            updateExamLobby();
        }
    }, handleRealtimeReadError);

    firebaseApi.onValue(portalRef("examArchives"), snapshot => {
        examArchives = collectionValues(snapshot.val());
        if (isVisible("admin-screen") && isVisible("adm-sec-archive")) renderArchive();
    }, handleRealtimeReadError);

    firebaseApi.onValue(portalRef("examResults"), snapshot => {
        studentExamResults = collectionValues(snapshot.val());
        if (isVisible("admin-screen") && isVisible("adm-sec-analytics")) renderAnalyticsLeaderboard();
        if (isVisible("student-screen") && isVisible("student-history-card")) renderStudentExamHistory();
    }, handleRealtimeReadError);
}

function collectionValues(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return Object.values(value || {});
}

function handleRealtimeReadError(error) {
    console.error("Firebase read error:", error);
    showConnectionMessage("Live updates stopped. Check your Firebase Database Rules.", "var(--danger)");
}

function showConnectionMessage(message, color) {
    const form = document.getElementById("login-form");
    if (!form) return;

    let messageBox = document.getElementById("firebase-connection-message");
    if (!messageBox) {
        messageBox = document.createElement("p");
        messageBox.id = "firebase-connection-message";
        messageBox.style.cssText = "font-size:0.8rem; margin-top:12px; text-align:center;";
        form.insertAdjacentElement("afterend", messageBox);
    }

    messageBox.innerText = message;
    messageBox.style.color = color;
}

function requireRealtimeConnection() {
    if (portalIsReady) return true;
    alert("The live database is not connected yet. Complete firebase-config.js and reload the page.");
    return false;
}

function isVisible(id) {
    const element = document.getElementById(id);
    return Boolean(element && !element.classList.contains("hidden"));
}

function handleLogin(event) {
    event.preventDefault();

    if (!requireRealtimeConnection()) return;

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (username === "admin" && password === "adminpass") {
        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("admin-screen").classList.remove("hidden");
        switchAdminTab("exam-gen");
        renderRegisteredStudents();
        renderAnalyticsLeaderboard();
        renderArchive();
        return;
    }

    const student = registeredStudents.find(item => item.phone === username && item.pass === password);
    if (!student) {
        alert("Invalid credentials. Enter a registered phone number and password.");
        return;
    }

    currentLoggedInUser = student;
    document.getElementById("display-student-name").innerText = student.name;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("student-screen").classList.remove("hidden");
    switchStudentTab("practice");
}

function logout() {
    clearInterval(timerInterval);
    activeSessionExam = null;
    currentLoggedInUser = null;
    document.getElementById("admin-screen").classList.add("hidden");
    document.getElementById("student-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
}

// ADMIN TABS
function switchAdminTab(tab) {
    document.getElementById("btn-adm-exam").classList.remove("active");
    document.getElementById("btn-adm-analytics").classList.remove("active");
    document.getElementById("btn-adm-students").classList.remove("active");
    document.getElementById("btn-adm-archive").classList.remove("active");

    document.getElementById("adm-sec-exam").classList.add("hidden");
    document.getElementById("adm-sec-analytics").classList.add("hidden");
    document.getElementById("adm-sec-students").classList.add("hidden");
    document.getElementById("adm-sec-archive").classList.add("hidden");

    if (tab === "exam-gen") {
        document.getElementById("btn-adm-exam").classList.add("active");
        document.getElementById("adm-sec-exam").classList.remove("hidden");
    } else if (tab === "analytics") {
        document.getElementById("btn-adm-analytics").classList.add("active");
        document.getElementById("adm-sec-analytics").classList.remove("hidden");
        renderAnalyticsLeaderboard();
    } else if (tab === "students") {
        document.getElementById("btn-adm-students").classList.add("active");
        document.getElementById("adm-sec-students").classList.remove("hidden");
        renderRegisteredStudents();
    } else if (tab === "archive") {
        document.getElementById("btn-adm-archive").classList.add("active");
        document.getElementById("adm-sec-archive").classList.remove("hidden");
        renderArchive();
    }
}

// STUDENT MANAGEMENT
async function registerNewStudent() {
    if (!requireRealtimeConnection()) return;

    const name = document.getElementById("new-std-name").value.trim();
    const phone = document.getElementById("new-std-phone").value.trim();
    const pass = document.getElementById("new-std-pass").value.trim();

    if (!name || !phone || !pass) {
        alert("Please fill all student details.");
        return;
    }

    if (!/^[0-9]{10,15}$/.test(phone)) {
        alert("Enter a phone number using 10 to 15 digits.");
        return;
    }

    if (registeredStudents.some(student => student.phone === phone)) {
        alert("A student with this phone number already exists.");
        return;
    }

    try {
        await firebaseApi.set(portalRef("students/" + phone), { name, phone, pass });
        document.getElementById("new-std-name").value = "";
        document.getElementById("new-std-phone").value = "";
        document.getElementById("new-std-pass").value = "";
        alert("Student " + name + " registered successfully.");
    } catch (error) {
        console.error("Could not register student:", error);
        alert("Student could not be saved. Check the Firebase connection.");
    }
}

function renderRegisteredStudents() {
    const table = document.getElementById("registered-students-table");
    if (!registeredStudents.length) {
        table.innerHTML = "<tr><td colspan='4'>No students registered yet.</td></tr>";
        return;
    }

    table.innerHTML = registeredStudents.map(student => {
        return "<tr>" +
            "<td><b>" + escapeHtml(student.name) + "</b></td>" +
            "<td>" + escapeHtml(student.phone) + "</td>" +
            "<td><code>••••••</code></td>" +
            "<td><button class='btn btn-danger' style='padding:4px 10px; font-size:0.75rem;' onclick=\"deleteStudent('" + student.phone + "')\">Remove</button></td>" +
            "</tr>";
    }).join("");
}

async function deleteStudent(phone) {
    if (!requireRealtimeConnection()) return;
    if (!confirm("Remove this student?")) return;

    try {
        await firebaseApi.remove(portalRef("students/" + phone));
    } catch (error) {
        console.error("Could not remove student:", error);
        alert("Student could not be removed. Check the Firebase connection.");
    }
}

// PDF PROCESSING AND EXAM SETUP
async function handlePDFUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    document.getElementById("file-status").innerText = "Extracting raw text from uploaded files...";
    extractedPDFText = "";

    try {
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            if (file.type === "application/pdf") {
                extractedPDFText += "\n" + await extractTextFromPDF(file);
            } else {
                extractedPDFText += "\n" + await file.text();
            }
        }
        document.getElementById("file-status").innerText = "Ingested text from " + files.length + " document(s).";
    } catch (error) {
        console.error("PDF extraction failed:", error);
        document.getElementById("file-status").innerText = "Could not read one of the selected files.";
    }
}

function extractTextFromPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function () {
            try {
                const typedArray = new Uint8Array(this.result);
                const pdf = await window.pdfjsLib.getDocument(typedArray).promise;
                let fullText = "";

                for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                    const page = await pdf.getPage(pageNumber);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(" ") + "\n";
                }

                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

async function generatePDFQuestions() {
    if (!requireRealtimeConnection()) return;

    if (!extractedPDFText || extractedPDFText.trim().length === 0) {
        alert("Upload PDF reference documents first.");
        return;
    }

    const requestedCount = parseInt(document.getElementById("required-q-count").value, 10) || 20;
    const sentences = extractedPDFText.split("\n").map(item => item.trim()).filter(item => item.length > 30);
    const generatedQuestions = [];

    for (let index = 0; index < requestedCount + 10; index += 1) {
        const referenceSnippet = sentences[index % sentences.length] || "What principle governs section concept " + (index + 1) + "?";
        const topicWords = referenceSnippet.split(" ");
        const coreKeyword = topicWords[0] || "Concept";
        const cleanQuestion = referenceSnippet.length > 100 ? referenceSnippet.substring(0, 100) + "?" : referenceSnippet;

        generatedQuestions.push({
            cleanQuestion,
            options: [
                "Primary directive for " + coreKeyword,
                "Secondary operational rule",
                "Disclose as non-operational note",
                "Defer recognition under guidelines"
            ],
            correct: 0
        });
    }

    try {
        await firebaseApi.set(portalRef("masterQuestionPool"), generatedQuestions);
        masterQuestionPool = generatedQuestions;
        document.getElementById("preview-count").innerText = generatedQuestions.length;
        alert("Generated " + generatedQuestions.length + " master questions. They are now available on every device.");
    } catch (error) {
        console.error("Could not save the question pool:", error);
        alert("The question pool could not be saved. Check the Firebase connection.");
    }
}

async function publishExamToStudents() {
    if (!requireRealtimeConnection()) return;

    if (masterQuestionPool.length === 0) {
        alert("Process PDF materials first.");
        return;
    }

    const duration = document.getElementById("exam-duration").value;
    const requiredCount = parseInt(document.getElementById("required-q-count").value, 10) || 20;
    const title = document.getElementById("exam-title-input").value.trim() || "Live Standard Exam";
    const markPerCorrect = parseFloat(document.getElementById("mark-per-correct").value) || 1;
    const markPerWrong = parseFloat(document.getElementById("mark-per-wrong").value) || 0;
    const examPayload = {
        id: "EXAM_" + Date.now(),
        title,
        date: new Date().toLocaleDateString(),
        publishedAt: Date.now(),
        masterPool: masterQuestionPool.slice(0, requiredCount),
        requiredCount,
        duration,
        markPerCorrect,
        markPerWrong,
        isPublished: true
    };

    try {
        const changes = {
            publishedExam: examPayload
        };
        changes["examArchives/" + examPayload.id] = examPayload;
        await firebaseApi.update(portalRef(), changes);
        alert("Live exam " + title + " published. Every open student portal updates now.");
    } catch (error) {
        console.error("Could not publish exam:", error);
        alert("The exam could not be published. Check the Firebase connection.");
    }
}

// STUDENT TABS AND LOGIC
function switchStudentTab(tab) {
    activeMode = tab;
    activeSessionExam = null;
    document.getElementById("btn-practice-tab").classList.remove("active");
    document.getElementById("btn-exam-tab").classList.remove("active");
    document.getElementById("btn-history-tab").classList.remove("active");

    resetStudentPortalView();

    if (tab === "practice") {
        document.getElementById("btn-practice-tab").classList.add("active");
        document.getElementById("session-title").innerText = "Unlimited Practice Area";
        document.getElementById("session-desc").innerText = "Practice mode is always open. Practice questions freely to build your knowledge without time stress.";
        document.getElementById("start-btn").innerText = "Start Practice Session";
        document.getElementById("start-btn").classList.remove("hidden");
    } else if (tab === "exam") {
        document.getElementById("btn-exam-tab").classList.add("active");
        updateExamLobby();
    } else if (tab === "history") {
        document.getElementById("btn-history-tab").classList.add("active");
        document.getElementById("start-session-card").classList.add("hidden");
        document.getElementById("student-history-card").classList.remove("hidden");
        renderStudentExamHistory();
    }
}

function updateExamLobby() {
    document.getElementById("session-title").innerText = "Scheduled Live Exam Area";
    const startButton = document.getElementById("start-btn");

    if (!publishedExam || !publishedExam.isPublished) {
        document.getElementById("session-desc").innerText = "No active exam is currently published by the administrator.";
        startButton.classList.add("hidden");
        return;
    }

    document.getElementById("session-desc").innerText =
        "Active Exam: " + publishedExam.title +
        ". Duration: " + publishedExam.duration +
        " Mins. Questions: " + publishedExam.requiredCount +
        ". Marking: +" + publishedExam.markPerCorrect +
        " / -" + publishedExam.markPerWrong;
    startButton.classList.remove("hidden");
    startButton.innerText = "Start Scheduled Exam";
}

function startActiveSession() {
    if (!requireRealtimeConnection()) return;

    let pool = masterQuestionPool;
    if (activeMode === "exam") {
        if (!publishedExam || !publishedExam.isPublished) {
            alert("There is no active exam yet.");
            return;
        }
        activeSessionExam = JSON.parse(JSON.stringify(publishedExam));
        pool = activeSessionExam.masterPool || [];
    } else {
        activeSessionExam = null;
    }

    if (!pool.length) {
        alert("No questions are available yet.");
        return;
    }

    document.getElementById("start-session-card").classList.add("hidden");
    document.getElementById("student-history-card").classList.add("hidden");
    document.getElementById("quiz-container").classList.remove("hidden");

    activeStudentQuestions = shuffleArray(JSON.parse(JSON.stringify(pool)));
    currentQuestionIndex = 0;
    studentAnswers = new Array(activeStudentQuestions.length).fill(null);

    if (activeMode === "exam") {
        document.getElementById("current-mode-label").innerText = "Live Exam";
        document.getElementById("btn-practice-ai").classList.add("hidden");
        document.getElementById("btn-finish-practice").classList.add("hidden");
        document.getElementById("btn-finish-exam").classList.remove("hidden");
        document.getElementById("btn-finish-exam").disabled = true;
    } else {
        document.getElementById("current-mode-label").innerText = "Practice Mode";
        document.getElementById("btn-practice-ai").classList.remove("hidden");
        document.getElementById("btn-finish-practice").classList.remove("hidden");
        document.getElementById("btn-finish-exam").classList.add("hidden");
    }

    startTimer();
    displayCurrentQuestion();
}

function displayCurrentQuestion() {
    if (!activeStudentQuestions.length) {
        document.getElementById("q-text").innerText = "No questions available in repository.";
        return;
    }

    const question = activeStudentQuestions[currentQuestionIndex];
    document.getElementById("question-tracker").innerText =
        "Question " + (currentQuestionIndex + 1) + " of " + activeStudentQuestions.length;
    document.getElementById("q-text").innerText =
        "Q" + (currentQuestionIndex + 1) + ". " + question.cleanQuestion;

    const container = document.getElementById("options-container");
    container.innerHTML = "";

    question.options.forEach((optionText, optionIndex) => {
        const button = document.createElement("button");
        button.className = "option-btn";
        button.innerText = optionText;

        if (studentAnswers[currentQuestionIndex] === optionIndex) {
            button.classList.add("selected");
        }

        button.onclick = () => selectOption(optionIndex, button);
        container.appendChild(button);
    });

    if (activeMode === "exam" && currentQuestionIndex === activeStudentQuestions.length - 1) {
        document.getElementById("btn-finish-exam").disabled = false;
    }
}

function selectOption(selectedIndex, buttonElement) {
    studentAnswers[currentQuestionIndex] = selectedIndex;
    document.querySelectorAll(".option-btn").forEach(button => button.classList.remove("selected"));
    buttonElement.classList.add("selected");
}

function nextQuestion() {
    if (currentQuestionIndex < activeStudentQuestions.length - 1) {
        currentQuestionIndex += 1;
        displayCurrentQuestion();
    } else {
        alert("You have reached the end of the questions.");
    }
}

function startTimer() {
    clearInterval(timerInterval);
    elapsedSeconds = 0;
    timerInterval = setInterval(() => {
        elapsedSeconds += 1;
        const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
        const seconds = String(elapsedSeconds % 60).padStart(2, "0");
        document.getElementById("student-timer").innerText = "⏱️ " + minutes + ":" + seconds;
    }, 1000);
}

async function finishSession() {
    if (isSubmitting) return;
    clearInterval(timerInterval);

    document.getElementById("quiz-container").classList.add("hidden");
    document.getElementById("review-container").classList.remove("hidden");

    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
    const seconds = String(elapsedSeconds % 60).padStart(2, "0");
    const timeSpent = minutes + ":" + seconds;
    const totalQuestions = activeStudentQuestions.length;

    if (activeMode === "practice") {
        const attendedAnswers = studentAnswers.filter(answer => answer !== null);
        let correctInAttended = 0;

        activeStudentQuestions.forEach((question, index) => {
            if (studentAnswers[index] !== null && studentAnswers[index] === question.correct) {
                correctInAttended += 1;
            }
        });

        document.getElementById("summary-heading").innerText = "Practice Session Complete!";
        document.getElementById("summary-subtext").innerText = "Great practice effort. Practice more to master concepts.";
        document.getElementById("res-time").innerText = timeSpent + " Mins";
        document.getElementById("score-label-title").innerText = "Score (Attended Questions)";
        document.getElementById("res-score").innerText = correctInAttended + " / " + attendedAnswers.length + " Attended";
        document.getElementById("exam-review-section").classList.add("hidden");
        return;
    }

    isSubmitting = true;
    const exam = activeSessionExam || publishedExam || {};
    const markPerCorrect = Number(exam.markPerCorrect) || 1;
    const markPerWrong = Number(exam.markPerWrong) || 0;
    let correctCount = 0;
    let wrongCount = 0;

    activeStudentQuestions.forEach((question, index) => {
        if (studentAnswers[index] !== null) {
            if (studentAnswers[index] === question.correct) {
                correctCount += 1;
            } else {
                wrongCount += 1;
            }
        }
    });

    const totalMarks = (correctCount * markPerCorrect) - (wrongCount * markPerWrong);
    const maximumMarks = totalQuestions * markPerCorrect;
    const accuracy = maximumMarks ? Math.max(0, Math.round((totalMarks / maximumMarks) * 100)) : 0;

    document.getElementById("summary-heading").innerText = "Exam Submitted!";
    document.getElementById("summary-subtext").innerText = "Your exam result has been added to your Previous Exam History.";
    document.getElementById("res-time").innerText = timeSpent + " Mins";
    document.getElementById("score-label-title").innerText = "Final Exam Score";
    document.getElementById("res-score").innerText = totalMarks + " / " + maximumMarks + " Marks";
    document.getElementById("exam-review-section").classList.remove("hidden");
    renderExamReviewList("exam-questions-review-list", activeStudentQuestions, studentAnswers);

    const resultId = "RESULT_" + Date.now() + "_" + currentLoggedInUser.phone;
    const examRecord = {
        id: resultId,
        studentName: currentLoggedInUser.name,
        phone: currentLoggedInUser.phone,
        examTitle: exam.title || "Scheduled Exam",
        score: totalMarks + "/" + maximumMarks,
        accuracy,
        timeSpent,
        date: new Date().toLocaleDateString(),
        questions: activeStudentQuestions,
        userAnswers: studentAnswers
    };

    try {
        await firebaseApi.set(portalRef("examResults/" + resultId), examRecord);
    } catch (error) {
        console.error("Could not save exam result:", error);
        alert("Your result could not be synchronized. Check the Firebase connection.");
    } finally {
        isSubmitting = false;
    }
}

function renderExamReviewList(containerId, questions, userAnswers) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    questions.forEach((question, index) => {
        const selectedIndex = userAnswers[index];
        const userText = selectedIndex !== null ? question.options[selectedIndex] : "Not Answered";
        const correctText = question.options[question.correct];
        const isCorrect = selectedIndex === question.correct;

        container.innerHTML += "<div class='review-card'>" +
            "<b>Q" + (index + 1) + ": " + escapeHtml(question.cleanQuestion) + "</b>" +
            "<div style='margin-top:10px;'>" +
            "<span class='" + (isCorrect ? "correct-tag" : "wrong-tag") + "'>Your Selection: " + escapeHtml(userText) + "</span><br>" +
            "<span class='correct-tag' style='margin-top:5px; display:inline-block;'>Correct Answer Key: " + escapeHtml(correctText) + "</span>" +
            "</div></div>";
    });
}

function renderStudentExamHistory() {
    const container = document.getElementById("student-history-list");
    container.innerHTML = "";

    if (!currentLoggedInUser) return;
    const myExams = studentExamResults.filter(record => record.phone === currentLoggedInUser.phone);

    if (!myExams.length) {
        container.innerHTML = "<p style='color:var(--text-sub);'>You have not completed any scheduled exams yet.</p>";
        return;
    }

    myExams.forEach((exam, index) => {
        container.innerHTML += "<div class='review-card' style='display:flex; justify-content:space-between; align-items:center;'>" +
            "<div><h4 style='color:var(--accent-teal);'>" + escapeHtml(exam.examTitle) + "</h4>" +
            "<p style='font-size:0.85rem; color:var(--text-sub);'>Attempted Date: " + escapeHtml(exam.date) +
            " | Time Spent: " + escapeHtml(exam.timeSpent) + " Mins</p>" +
            "<p style='font-size:0.9rem; margin-top:5px;'>Score: <b style='color:var(--success);'>" + escapeHtml(exam.score) +
            "</b> (Accuracy: " + escapeHtml(exam.accuracy) + "%)</p></div>" +
            "<button class='btn btn-secondary' style='width:auto; padding:8px 18px; font-size:0.85rem;' onclick='viewHistoryExamDetail(" + index + ")'>View Detailed Answers</button>" +
            "</div>";
    });
}

function viewHistoryExamDetail(index) {
    if (!currentLoggedInUser) return;
    const myExams = studentExamResults.filter(record => record.phone === currentLoggedInUser.phone);
    const record = myExams[index];
    if (!record) return;

    document.getElementById("hist-modal-title").innerText = record.examTitle;
    document.getElementById("hist-modal-meta").innerText =
        "Date: " + record.date + " | Score: " + record.score + " (" + record.accuracy + "%)";
    renderExamReviewList("hist-modal-questions", record.questions, record.userAnswers);
    document.getElementById("history-modal").classList.remove("hidden");
}

function generateAIQuestionsForStudent() {
    const extraQuestion = {
        cleanQuestion: "What primary rule applies to provisions under standard financial codes?",
        options: [
            "Recognize provision when present obligation exists",
            "Ignore contingent liabilities entirely",
            "Classify always under revenue reserves",
            "Amortize as operational goodwill"
        ],
        correct: 0
    };

    activeStudentQuestions.push(extraQuestion);
    alert("New practice question added to your current session.");
    displayCurrentQuestion();
}

// ANALYTICS AND ARCHIVE
function renderAnalyticsLeaderboard() {
    const table = document.getElementById("student-results-table");
    const topList = document.getElementById("top-performers-list");
    const weakList = document.getElementById("weak-performers-list");
    table.innerHTML = "";
    topList.innerHTML = "";
    weakList.innerHTML = "";

    if (!studentExamResults.length) {
        table.innerHTML = "<tr><td colspan='6'>No student exams recorded yet.</td></tr>";
        return;
    }

    studentExamResults.forEach(record => {
        table.innerHTML += "<tr>" +
            "<td><b>" + escapeHtml(record.studentName) + "</b></td>" +
            "<td>" + escapeHtml(record.phone) + "</td>" +
            "<td>" + escapeHtml(record.examTitle || "Live Exam") + "</td>" +
            "<td><b>" + escapeHtml(record.score) + "</b></td>" +
            "<td>" + escapeHtml(record.accuracy) + "%</td>" +
            "<td>" + escapeHtml(record.timeSpent) + " Mins</td>" +
            "</tr>";

        const person = "<div style='margin-bottom:6px;'><b>" + escapeHtml(record.studentName) +
            "</b> (" + escapeHtml(record.phone) + ") - " + escapeHtml(record.examTitle) +
            ": " + escapeHtml(record.score) + " (" + escapeHtml(record.accuracy) + "%)</div>";

        if (record.accuracy >= 75) {
            topList.innerHTML += person;
        } else {
            weakList.innerHTML += person;
        }
    });
}

function renderArchive() {
    const container = document.getElementById("archive-accordion-list");
    container.innerHTML = "";

    if (!examArchives.length) {
        container.innerHTML = "<p style='color:var(--text-sub);'>No exams archived yet.</p>";
        return;
    }

    examArchives.forEach((exam, examIndex) => {
        const questionsHtml = (exam.masterPool || []).map((question, questionIndex) => {
            return "<div style='margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;'>" +
                "<b>Q" + (questionIndex + 1) + ":</b> " + escapeHtml(question.cleanQuestion) + "<br>" +
                "<span style='color:var(--success); font-size:0.85rem;'>Correct Answer Key: " +
                escapeHtml(question.options[question.correct]) + "</span></div>";
        }).join("");

        container.innerHTML += "<div class='archive-card'>" +
            "<div style='display:flex; justify-content:space-between; align-items:center;'>" +
            "<div><h4 style='color:var(--accent-teal); font-size:1.1rem;'>Exam " + (examIndex + 1) +
            ": " + escapeHtml(exam.title) + "</h4>" +
            "<p style='font-size:0.85rem; color:var(--text-sub); margin-top:3px;'>Published Date: <b>" +
            escapeHtml(exam.date) + "</b> | Questions: <b>" + escapeHtml(exam.requiredCount) +
            "</b> | Marking: <b>+" + escapeHtml(exam.markPerCorrect) + " / -" +
            escapeHtml(exam.markPerWrong) + "</b></p></div>" +
            "<button class='btn btn-secondary' style='width:auto; padding:8px 18px; font-size:0.85rem;' onclick='toggleArchiveDetail(" +
            examIndex + ")'>View Exam Questions</button></div>" +
            "<div id='archive-content-" + examIndex +
            "' class='hidden' style='margin-top:20px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.1);'>" +
            questionsHtml + "</div></div>";
    });
}

function toggleArchiveDetail(index) {
    const target = document.getElementById("archive-content-" + index);
    target.classList.toggle("hidden");
}

function exportAnalyticsPDF() {
    if (!window.html2pdf) {
        alert("The PDF export library did not load.");
        return;
    }
    window.html2pdf().from(document.getElementById("analytics-pdf-content")).save("Optim_Student_Performance_Leaderboard.pdf");
}

function exportArchivePDF() {
    if (!window.html2pdf) {
        alert("The PDF export library did not load.");
        return;
    }
    window.html2pdf().from(document.getElementById("archive-pdf-content")).save("Optim_Previous_Exam_Question_Bank.pdf");
}

function resetStudentPortalView() {
    clearInterval(timerInterval);
    document.getElementById("quiz-container").classList.add("hidden");
    document.getElementById("review-container").classList.add("hidden");
    document.getElementById("student-history-card").classList.add("hidden");
    document.getElementById("start-session-card").classList.remove("hidden");
    document.getElementById("student-timer").innerText = "⏱️ 00:00";
}

function shuffleArray(array) {
    for (let index = array.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        const savedValue = array[index];
        array[index] = array[randomIndex];
        array[randomIndex] = savedValue;
    }
    return array;
}

function openPreviewModal() {
    const list = document.getElementById("preview-questions-list");
    list.innerHTML = "";

    if (!masterQuestionPool.length) {
        list.innerHTML = "<p>No questions generated yet. Process PDF materials first.</p>";
    } else {
        masterQuestionPool.forEach((question, index) => {
            list.innerHTML += "<div style='margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;'>" +
                "<b style='color:var(--accent-teal);'>Master Q" + (index + 1) + ":</b> " +
                escapeHtml(question.cleanQuestion) + "<br>" +
                "<span style='color:var(--success); font-size:0.85rem;'>Correct Answer Key: " +
                escapeHtml(question.options[question.correct]) + "</span></div>";
        });
    }

    document.getElementById("preview-modal").classList.remove("hidden");
}

function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };
        return entities[character];
    });
}
