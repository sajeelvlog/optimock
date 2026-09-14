// SYSTEM STATE
let extractedPDFText = "";
let masterQuestionPool = [];
let activeStudentQuestions = [];
let currentQuestionIndex = 0;
let studentAnswers = [];
let timerInterval = null;
let elapsedSeconds = 0;
let activeMode = 'practice';
let currentLoggedInUser = null;

// LOCAL STORAGE DATABASES
let registeredStudents = JSON.parse(localStorage.getItem('cma_students_db')) || [
    { name: "Rahul Sharma", phone: "9876543210", pass: "123456" },
    { name: "Ananya Nair", phone: "9123456789", pass: "123456" }
];

let studentExamResults = JSON.parse(localStorage.getItem('cma_exam_results')) || [];

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value.trim();

        if(u === "admin" && p === "adminpass") {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('admin-screen').classList.remove('hidden');
            switchAdminTab('exam-gen');
            renderRegisteredStudents();
            renderAnalyticsLeaderboard();
            renderArchive();
        } else {
            const foundStd = registeredStudents.find(s => s.phone === u && s.pass === p);
            if(foundStd) {
                currentLoggedInUser = foundStd;
                document.getElementById('display-student-name').innerText = foundStd.name;
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('student-screen').classList.remove('hidden');
                switchStudentTab('practice');
            } else {
                alert("Invalid Credentials! Enter registered phone number and password.");
            }
        }
    });
});

function logout() {
    clearInterval(timerInterval);
    document.getElementById('admin-screen').classList.add('hidden');
    document.getElementById('student-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
}

// ADMIN TABS
function switchAdminTab(tab) {
    document.getElementById('btn-adm-exam').classList.remove('active');
    document.getElementById('btn-adm-analytics').classList.remove('active');
    document.getElementById('btn-adm-students').classList.remove('active');
    document.getElementById('btn-adm-archive').classList.remove('active');

    document.getElementById('adm-sec-exam').classList.add('hidden');
    document.getElementById('adm-sec-analytics').classList.add('hidden');
    document.getElementById('adm-sec-students').classList.add('hidden');
    document.getElementById('adm-sec-archive').classList.add('hidden');

    if(tab === 'exam-gen') {
        document.getElementById('btn-adm-exam').classList.add('active');
        document.getElementById('adm-sec-exam').classList.remove('hidden');
    } else if(tab === 'analytics') {
        document.getElementById('btn-adm-analytics').classList.add('active');
        document.getElementById('adm-sec-analytics').classList.remove('hidden');
        renderAnalyticsLeaderboard();
    } else if(tab === 'students') {
        document.getElementById('btn-adm-students').classList.add('active');
        document.getElementById('adm-sec-students').classList.remove('hidden');
        renderRegisteredStudents();
    } else if(tab === 'archive') {
        document.getElementById('btn-adm-archive').classList.add('active');
        document.getElementById('adm-sec-archive').classList.remove('hidden');
        renderArchive();
    }
}

// STUDENT MANAGEMENT
function registerNewStudent() {
    const name = document.getElementById('new-std-name').value.trim();
    const phone = document.getElementById('new-std-phone').value.trim();
    const pass = document.getElementById('new-std-pass').value.trim();

    if(!name || !phone || !pass) {
        alert("Please fill all student details.");
        return;
    }

    registeredStudents.push({ name, phone, pass });
    localStorage.setItem('cma_students_db', JSON.stringify(registeredStudents));
    renderRegisteredStudents();
    alert(`Student ${name} registered successfully!`);
    document.getElementById('new-std-name').value = "";
    document.getElementById('new-std-phone').value = "";
    document.getElementById('new-std-pass').value = "";
}

function renderRegisteredStudents() {
    const table = document.getElementById('registered-students-table');
    table.innerHTML = "";
    registeredStudents.forEach((std, idx) => {
        table.innerHTML += `<tr>
            <td><b>${std.name}</b></td>
            <td>${std.phone}</td>
            <td><code>${std.pass}</code></td>
            <td><button class="btn btn-danger" style="padding:4px 10px; font-size:0.75rem;" onclick="deleteStudent(${idx})">Remove</button></td>
        </tr>`;
    });
}

function deleteStudent(idx) {
    registeredStudents.splice(idx, 1);
    localStorage.setItem('cma_students_db', JSON.stringify(registeredStudents));
    renderRegisteredStudents();
}

// PDF PROCESSING & EXAM SETUP
async function handlePDFUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    document.getElementById('file-status').innerText = "⏳ Extracting raw text from uploaded files...";
    extractedPDFText = "";

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type === "application/pdf") {
            const text = await extractTextFromPDF(file);
            extractedPDFText += "\n" + text;
        } else {
            const text = await file.text();
            extractedPDFText += "\n" + text;
        }
    }
    document.getElementById('file-status').innerText = `✅ Ingested text from ${files.length} document(s).`;
}

function extractTextFromPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = "";
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(" ") + "\n";
                }
                resolve(fullText);
            } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
    });
}

function generatePDFQuestions() {
    if (!extractedPDFText || extractedPDFText.trim().length === 0) {
        alert("⚠️ Upload PDF reference documents first!");
        return;
    }

    const reqCount = parseInt(document.getElementById('required-q-count').value) || 20;
    const sentences = extractedPDFText.split('\n').map(s => s.trim()).filter(s => s.length > 30);
    masterQuestionPool = [];

    for (let i = 0; i < reqCount + 10; i++) {
        const refSnippet = sentences[i % sentences.length] || `What principle governs section concept #${i+1}?`;
        const topicWords = refSnippet.split(' ');
        const coreKeyword = topicWords[0] || "Concept";

        let cleanQText = refSnippet.length > 100 ? refSnippet.substring(0, 100) + "?" : refSnippet;

        masterQuestionPool.push({
            cleanQuestion: cleanQText,
            options: [
                `Primary directive for ${coreKeyword}`,
                `Secondary operational rule`,
                `Disclose as non-operational note`,
                `Defer recognition under guidelines`
            ],
            correct: 0
        });
    }

    localStorage.setItem('cma_master_pool', JSON.stringify(masterQuestionPool));
    document.getElementById('preview-count').innerText = masterQuestionPool.length;
    alert(`✅ Generated ${masterQuestionPool.length} master questions.`);
}

function publishExamToStudents() {
    if (masterQuestionPool.length === 0) {
        alert("⚠️ Process PDF materials first!");
        return;
    }
    const duration = document.getElementById('exam-duration').value;
    const reqCount = parseInt(document.getElementById('required-q-count').value) || 20;
    const examTitle = document.getElementById('exam-title-input').value.trim() || "Live Standard Exam";
    
    const markCorrect = parseFloat(document.getElementById('mark-per-correct').value) || 1;
    const markWrong = parseFloat(document.getElementById('mark-per-wrong').value) || 0;

    const examPayload = {
        id: "EXAM_" + Date.now(),
        title: examTitle,
        date: new Date().toLocaleDateString(),
        masterPool: masterQuestionPool.slice(0, reqCount),
        requiredCount: reqCount,
        duration: duration,
        markPerCorrect: markCorrect,
        markPerWrong: markWrong,
        isPublished: true
    };

    localStorage.setItem('cma_published_exam', JSON.stringify(examPayload));

    let archives = JSON.parse(localStorage.getItem('cma_exam_archives')) || [];
    archives.push(examPayload);
    localStorage.setItem('cma_exam_archives', JSON.stringify(archives));

    alert(`🚀 Live Exam "${examTitle}" published successfully!\n(+${markCorrect} Marks / -${markWrong} Negative)`);
}

// STUDENT TAB & LOGIC
function switchStudentTab(tab) {
    activeMode = tab;
    document.getElementById('btn-practice-tab').classList.remove('active');
    document.getElementById('btn-exam-tab').classList.remove('active');
    document.getElementById('btn-history-tab').classList.remove('active');
    
    resetStudentPortalView();

    if (tab === 'practice') {
        document.getElementById('btn-practice-tab').classList.add('active');
        document.getElementById('session-title').innerText = "Unlimited Practice Area";
        document.getElementById('session-desc').innerText = "Practice mode is always open! Practice questions freely to build your knowledge without time stress.";
        document.getElementById('start-btn').innerText = "🚀 Start Practice Session";
        document.getElementById('start-btn').classList.remove('hidden');
    } else if (tab === 'exam') {
        document.getElementById('btn-exam-tab').classList.add('active');
        document.getElementById('session-title').innerText = "Scheduled Live Exam Area";
        
        const publishedExam = JSON.parse(localStorage.getItem('cma_published_exam') || '{}');
        if (!publishedExam.isPublished) {
            document.getElementById('session-desc').innerText = "⚠️ No active exam is currently published by the administrator.";
            document.getElementById('start-btn').classList.add('hidden');
        } else {
            document.getElementById('session-desc').innerText = `Active Exam: "${publishedExam.title}". Duration: ${publishedExam.duration} Mins. Questions: ${publishedExam.requiredCount}. Marking: +${publishedExam.markPerCorrect} / -${publishedExam.markPerWrong}`;
            document.getElementById('start-btn').classList.remove('hidden');
            document.getElementById('start-btn').innerText = "📝 Start Scheduled Exam";
        }
    } else if (tab === 'history') {
        document.getElementById('btn-history-tab').classList.add('active');
        document.getElementById('start-session-card').classList.add('hidden');
        document.getElementById('student-history-card').classList.remove('hidden');
        renderStudentExamHistory();
    }
}

function startActiveSession() {
    document.getElementById('start-session-card').classList.add('hidden');
    document.getElementById('student-history-card').classList.add('hidden');
    document.getElementById('quiz-container').classList.remove('hidden');

    const savedPool = localStorage.getItem('cma_master_pool');
    let pool = savedPool ? JSON.parse(savedPool) : masterQuestionPool;

    if (activeMode === 'exam') {
        const published = JSON.parse(localStorage.getItem('cma_published_exam'));
        pool = published.masterPool;

        activeStudentQuestions = shuffleArray([...pool]);

        document.getElementById('current-mode-label').innerText = "Live Exam";
        document.getElementById('btn-practice-ai').classList.add('hidden');
        document.getElementById('btn-finish-practice').classList.add('hidden');
        document.getElementById('btn-finish-exam').classList.remove('hidden');
        document.getElementById('btn-finish-exam').disabled = true;
    } else {
        activeStudentQuestions = shuffleArray([...pool]);
        document.getElementById('current-mode-label').innerText = "Practice Mode";
        document.getElementById('btn-practice-ai').classList.remove('hidden');
        document.getElementById('btn-finish-practice').classList.remove('hidden');
        document.getElementById('btn-finish-exam').classList.add('hidden');
    }

    currentQuestionIndex = 0;
    studentAnswers = new Array(activeStudentQuestions.length).fill(null);
    
    startTimer();
    displayCurrentQuestion();
}

function displayCurrentQuestion() {
    if (!activeStudentQuestions || activeStudentQuestions.length === 0) {
        document.getElementById('q-text').innerText = "No questions available in repository.";
        return;
    }

    const q = activeStudentQuestions[currentQuestionIndex];
    document.getElementById('question-tracker').innerText = `Question ${currentQuestionIndex + 1} of ${activeStudentQuestions.length}`;
    document.getElementById('q-text').innerText = `Q${currentQuestionIndex + 1}. ${q.cleanQuestion}`;

    const container = document.getElementById('options-container');
    container.innerHTML = "";

    q.options.forEach((optText, optIdx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = optText;

        if (studentAnswers[currentQuestionIndex] === optIdx) {
            btn.classList.add('selected');
        }

        btn.onclick = () => selectOption(optIdx, btn);
        container.appendChild(btn);
    });

    if (activeMode === 'exam' && currentQuestionIndex === activeStudentQuestions.length - 1) {
        document.getElementById('btn-finish-exam').disabled = false;
    }
}

function selectOption(selectedIdx, btnElement) {
    studentAnswers[currentQuestionIndex] = selectedIdx;

    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(b => b.classList.remove('selected'));
    btnElement.classList.add('selected');
}

function nextQuestion() {
    if (currentQuestionIndex < activeStudentQuestions.length - 1) {
        currentQuestionIndex++;
        displayCurrentQuestion();
    } else {
        alert("You have reached the end of the questions.");
    }
}

function startTimer() {
    clearInterval(timerInterval);
    elapsedSeconds = 0;
    timerInterval = setInterval(() => {
        elapsedSeconds++;
        const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
        const secs = String(elapsedSeconds % 60).padStart(2, '0');
        document.getElementById('student-timer').innerText = `⏱️ ${mins}:${secs}`;
    }, 1000);
}

function finishSession() {
    clearInterval(timerInterval);

    document.getElementById('quiz-container').classList.add('hidden');
    document.getElementById('review-container').classList.remove('hidden');

    const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const secs = String(elapsedSeconds % 60).padStart(2, '0');
    const totalQ = activeStudentQuestions.length;

    if (activeMode === 'practice') {
        const attendedAnswers = studentAnswers.filter(a => a !== null);
        const attendedCount = attendedAnswers.length;

        let correctInAttended = 0;
        activeStudentQuestions.forEach((q, idx) => {
            if (studentAnswers[idx] !== null && studentAnswers[idx] === q.correct) {
                correctInAttended++;
            }
        });

        document.getElementById('summary-heading').innerText = "Practice Session Complete!";
        document.getElementById('summary-subtext').innerText = "Great practice effort! Practice more to master concepts.";
        document.getElementById('res-time').innerText = `${mins}:${secs} Mins`;
        
        document.getElementById('score-label-title').innerText = "Score (Attended Questions)";
        document.getElementById('res-score').innerText = `${correctInAttended} / ${attendedCount} Attended`;
        document.getElementById('exam-review-section').classList.add('hidden');
    } else {
        const publishedExam = JSON.parse(localStorage.getItem('cma_published_exam') || '{}');
        const markCorrect = publishedExam.markPerCorrect || 1;
        const markWrong = publishedExam.markPerWrong || 0;
        const examTitle = publishedExam.title || "Scheduled Exam";

        let correctCount = 0;
        let wrongCount = 0;

        activeStudentQuestions.forEach((q, idx) => {
            if (studentAnswers[idx] !== null) {
                if (studentAnswers[idx] === q.correct) {
                    correctCount++;
                } else {
                    wrongCount++;
                }
            }
        });

        const totalMarksObtained = (correctCount * markCorrect) - (wrongCount * markWrong);
        const maxPossibleMarks = totalQ * markCorrect;
        const accuracy = Math.max(0, Math.round((totalMarksObtained / maxPossibleMarks) * 100));

        document.getElementById('summary-heading').innerText = "Exam Submitted!";
        document.getElementById('summary-subtext').innerText = "Your exam result has been archived to your Previous Exam History.";
        document.getElementById('res-time').innerText = `${mins}:${secs} Mins`;
        
        document.getElementById('score-label-title').innerText = "Final Exam Score";
        document.getElementById('res-score').innerText = `${totalMarksObtained} / ${maxPossibleMarks} Marks`;
        document.getElementById('exam-review-section').classList.remove('hidden');

        const examRecord = {
            id: "RESULT_" + Date.now(),
            studentName: currentLoggedInUser.name,
            phone: currentLoggedInUser.phone,
            examTitle: examTitle,
            score: `${totalMarksObtained}/${maxPossibleMarks}`,
            accuracy: accuracy,
            timeSpent: `${mins}:${secs}`,
            date: new Date().toLocaleDateString(),
            questions: activeStudentQuestions,
            userAnswers: studentAnswers
        };

        studentExamResults.push(examRecord);
        localStorage.setItem('cma_exam_results', JSON.stringify(studentExamResults));

        renderExamReviewList('exam-questions-review-list', activeStudentQuestions, studentAnswers);
    }
}

function renderExamReviewList(containerId, questions, userAns) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    questions.forEach((q, idx) => {
        const selectedIdx = userAns[idx];
        const userText = selectedIdx !== null ? q.options[selectedIdx] : "Not Answered";
        const correctText = q.options[q.correct];
        const isCorrect = selectedIdx === q.correct;

        container.innerHTML += `<div class="review-card">
            <b>Q${idx+1}: ${q.cleanQuestion}</b>
            <div style="margin-top:10px;">
                <span class="${isCorrect ? 'correct-tag' : 'wrong-tag'}">Your Selection: ${userText}</span><br>
                <span class="correct-tag" style="margin-top:5px; display:inline-block;">Correct Answer Key: ${correctText}</span>
            </div>
        </div>`;
    });
}

function renderStudentExamHistory() {
    const container = document.getElementById('student-history-list');
    container.innerHTML = "";

    const myExams = studentExamResults.filter(r => r.phone === currentLoggedInUser.phone);

    if (myExams.length === 0) {
        container.innerHTML = "<p style='color:var(--text-sub);'>You have not completed any scheduled exams yet.</p>";
        return;
    }

    myExams.forEach((ex, idx) => {
        container.innerHTML += `<div class="review-card" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h4 style="color:var(--accent-teal);">${ex.examTitle}</h4>
                <p style="font-size:0.85rem; color:var(--text-sub);">Attempted Date: ${ex.date} | Time Spent: ${ex.timeSpent} Mins</p>
                <p style="font-size:0.9rem; margin-top:5px;">Score: <b style="color:var(--success);">${ex.score}</b> (Accuracy: ${ex.accuracy}%)</p>
            </div>
            <button class="btn btn-secondary" style="width:auto; padding:8px 18px; font-size:0.85rem;" onclick="viewHistoryExamDetail(${idx})">👁️ View Detailed Answers</button>
        </div>`;
    });
}

function viewHistoryExamDetail(index) {
    const myExams = studentExamResults.filter(r => r.phone === currentLoggedInUser.phone);
    const record = myExams[index];

    document.getElementById('hist-modal-title').innerText = record.examTitle;
    document.getElementById('hist-modal-meta').innerText = `Date: ${record.date} | Score: ${record.score} (${record.accuracy}%)`;

    renderExamReviewList('hist-modal-questions', record.questions, record.userAnswers);
    document.getElementById('history-modal').classList.remove('hidden');
}

function generateAIQuestionsForStudent() {
    const extraQ = {
        cleanQuestion: `What primary rule applies to provisions under standard financial codes?`,
        options: [
            `Recognize provision when present obligation exists`,
            `Ignore contingent liabilities entirely`,
            `Classify always under revenue reserves`,
            `Amortize as operational goodwill`
        ],
        correct: 0
    };
    activeStudentQuestions.push(extraQ);
    alert("🤖 New Practice Question added to your current session!");
    displayCurrentQuestion();
}

function renderAnalyticsLeaderboard() {
    const table = document.getElementById('student-results-table');
    const topList = document.getElementById('top-performers-list');
    const weakList = document.getElementById('weak-performers-list');

    table.innerHTML = "";
    topList.innerHTML = "";
    weakList.innerHTML = "";

    if (studentExamResults.length === 0) {
        table.innerHTML = "<tr><td colspan='6'>No student exams recorded yet.</td></tr>";
        return;
    }

    studentExamResults.forEach(r => {
        table.innerHTML += `<tr>
            <td><b>${r.studentName}</b></td>
            <td>${r.phone}</td>
            <td>${r.examTitle || 'Live Exam'}</td>
            <td><b>${r.score}</b></td>
            <td>${r.accuracy}%</td>
            <td>${r.timeSpent} Mins</td>
        </tr>`;

        if(r.accuracy >= 75) {
            topList.innerHTML += `<div style="margin-bottom:6px;">🥇 <b>${r.studentName}</b> (${r.phone}) - ${r.examTitle}: ${r.score} (${r.accuracy}%)</div>`;
        } else {
            weakList.innerHTML += `<div style="margin-bottom:6px;">⚠️ <b>${r.studentName}</b> (${r.phone}) - ${r.examTitle}: ${r.score} (${r.accuracy}%)</div>`;
        }
    });
}

function renderArchive() {
    const archives = JSON.parse(localStorage.getItem('cma_exam_archives')) || [];
    const container = document.getElementById('archive-accordion-list');
    container.innerHTML = "";

    if (archives.length === 0) {
        container.innerHTML = "<p style='color:var(--text-sub);'>No exams archived yet.</p>";
        return;
    }

    archives.forEach((ex, exIdx) => {
        let questionsHTML = "";
        ex.masterPool.forEach((q, qIdx) => {
            questionsHTML += `<div style="margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                <b>Q${qIdx+1}:</b> ${q.cleanQuestion}<br>
                <span style="color:var(--success); font-size:0.85rem;">Correct Answer Key: ${q.options[q.correct]}</span>
            </div>`;
        });

        container.innerHTML += `
        <div class="archive-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h4 style="color:var(--accent-teal); font-size:1.1rem;">📝 Exam ${exIdx + 1}: ${ex.title}</h4>
                    <p style="font-size:0.85rem; color:var(--text-sub); margin-top:3px;">
                        Published Date: <b>${ex.date}</b> | Questions: <b>${ex.requiredCount}</b> | Marking: <b>+${ex.markPerCorrect} / -${ex.markPerWrong}</b>
                    </p>
                </div>
                <button class="btn btn-secondary" style="width:auto; padding:8px 18px; font-size:0.85rem;" onclick="toggleArchiveDetail(${exIdx})">
                    👁️ View Exam Questions
                </button>
            </div>
            
            <div id="archive-content-${exIdx}" class="hidden" style="margin-top:20px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.1);">
                ${questionsHTML}
            </div>
        </div>`;
    });
}

function toggleArchiveDetail(index) {
    const target = document.getElementById(`archive-content-${index}`);
    if (target.classList.contains('hidden')) {
        target.classList.remove('hidden');
    } else {
        target.classList.add('hidden');
    }
}

function exportAnalyticsPDF() {
    const element = document.getElementById('analytics-pdf-content');
    html2pdf().from(element).save('Optim_Student_Performance_Leaderboard.pdf');
}

function exportArchivePDF() {
    const element = document.getElementById('archive-pdf-content');
    html2pdf().from(element).save('Optim_Previous_Exam_Question_Bank.pdf');
}

function resetStudentPortalView() {
    clearInterval(timerInterval);
    document.getElementById('quiz-container').classList.add('hidden');
    document.getElementById('review-container').classList.add('hidden');
    document.getElementById('student-history-card').classList.add('hidden');
    document.getElementById('start-session-card').classList.remove('hidden');
    document.getElementById('student-timer').innerText = "⏱️ 00:00";
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function openPreviewModal() {
    const list = document.getElementById('preview-questions-list');
    list.innerHTML = "";
    const savedPool = localStorage.getItem('cma_master_pool');
    const pool = savedPool ? JSON.parse(savedPool) : masterQuestionPool;

    if (pool.length === 0) {
        list.innerHTML = "<p>No questions generated yet. Process PDF materials first.</p>";
    } else {
        pool.forEach((q, idx) => {
            list.innerHTML += `<div style="margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
                <b style="color:var(--accent-teal);">Master Q${idx+1}:</b> ${q.cleanQuestion}<br>
                <span style="color:var(--success); font-size:0.85rem;">Correct Answer Key: ${q.options[q.correct]}</span>
            </div>`;
        });
    }
    document.getElementById('preview-modal').classList.remove('hidden');
}

function closeModal(id) { 
    document.getElementById(id).classList.add('hidden'); 
}