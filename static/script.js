document.addEventListener('DOMContentLoaded', function () {
    // --- ELEMENT SELECTION ---
    const loader = document.getElementById('loader');
    const screens = document.querySelectorAll('.screen');
    const welcomeScreen = document.getElementById('welcome-screen');
    const testHardwareBtn = document.getElementById('test-hardware-btn');
    const goToSetupBtn = document.getElementById('go-to-setup-btn');
    const hardwareTestArea = document.getElementById('hardware-test-area');
    const testVideo = document.getElementById('test-video');
    const micVisualizer = document.getElementById('mic-visualizer');
    const hardwareStatus = document.getElementById('hardware-status');
    
    const setupScreen = document.getElementById('setup-screen');
    const resumeFile = document.getElementById('resume-file');
    const uploadBtn = document.getElementById('upload-btn');
    const uploadStatus = document.getElementById('upload-status');
    const jobTitleSelect = document.getElementById('job-title');
    const interviewRoundGroup = document.getElementById('interview-round');
    const startInterviewBtn = document.getElementById('start-interview-btn');

    const interviewScreen = document.getElementById('interview-screen');
    const userVideo = document.getElementById('user-video');
    const aiAvatar = document.getElementById('ai-avatar');
    const chatWindow = document.getElementById('chat-window');
    const micBtn = document.getElementById('mic-btn');
    const micStatus = document.getElementById('mic-status');
    const thinkBtn = document.getElementById('think-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    const timerDisplay = document.getElementById('timer-display');
    const endInterviewBtn = document.getElementById('end-interview-btn');

    const feedbackScreen = document.getElementById('feedback-screen');
    const feedbackContent = document.getElementById('feedback-content');
    const restartBtn = document.getElementById('restart-btn');

    // --- STATE VARIABLES ---
    let resumeText = '';
    let interviewState = 'ongoing';
    let timerInterval;
    let localStream;
    let isRecording = false;
    let recognition;
    let currentTranscriptElement = null; // To hold the live transcript element

    // UPDATED AVATAR URLs
    const AVATAR_LISTEN_URL = 'https://img.freepik.com/premium-photo/mechanical-engineer-digital-avatar-generative-ai_934475-9196.jpg?w=2000';
    const AVATAR_SPEAK_URL = 'https://img.freepik.com/premium-photo/mechanical-engineer-digital-avatar-generative-ai_934475-9196.jpg?w=2000';
    const AVATAR_THINK_URL = 'https://i.ibb.co/Gtn6hS0/thinking-avatar.gif';


    // --- INITIALIZATION ---
    window.addEventListener('load', () => {
        loader.classList.remove('active');
        showScreen('welcome-screen');
    });

    // --- SCREEN MANAGEMENT ---
    function showScreen(screenId) {
        screens.forEach(screen => screen.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    // --- WELCOME & HARDWARE TEST ---
    testHardwareBtn.addEventListener('click', async () => {
        hardwareTestArea.style.display = 'block';
        hardwareStatus.textContent = "Accessing devices...";
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStream = stream; // Store stream to stop it later
            testVideo.srcObject = stream;
            hardwareStatus.textContent = "✅ Camera working!";
            
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            source.connect(analyser);
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const canvasCtx = micVisualizer.getContext('2d');

            function draw() {
                if (!micVisualizer || !micVisualizer.isConnected) return;
                requestAnimationFrame(draw);
                analyser.getByteFrequencyData(dataArray);
                canvasCtx.fillStyle = '#1e1e1e';
                canvasCtx.fillRect(0, 0, micVisualizer.width, micVisualizer.height);
                let barWidth = (micVisualizer.width / bufferLength) * 2.5;
                let barHeight;
                let x = 0;
                for (let i = 0; i < bufferLength; i++) {
                    barHeight = dataArray[i] / 2;
                    canvasCtx.fillStyle = `rgb(157, 78, 221, ${barHeight / 100})`;
                    canvasCtx.fillRect(x, micVisualizer.height - barHeight, barWidth, barHeight);
                    x += barWidth + 1;
                }
            }
            draw();
            hardwareStatus.textContent += " ✅ Mic working!";
            goToSetupBtn.disabled = false;
        } catch (err) {
            hardwareStatus.textContent = "❌ Could not access camera or mic. Please check permissions.";
            console.error(err);
        }
    });

    goToSetupBtn.addEventListener('click', () => {
        showScreen('setup-screen');
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
    });

    // --- SETUP LOGIC ---
    uploadBtn.addEventListener('click', () => resumeFile.click());
    resumeFile.addEventListener('change', () => {
        const file = resumeFile.files[0];
        if (!file) return;
        uploadStatus.textContent = 'Uploading...';
        const formData = new FormData();
        formData.append('resume', file);
        fetch('/upload_resume', { method: 'POST', body: formData })
            .then(res => res.json()).then(data => {
                if (data.error) { uploadStatus.textContent = data.error; }
                else {
                    resumeText = data.text;
                    uploadStatus.textContent = `✅ ${file.name} uploaded!`;
                    startInterviewBtn.disabled = false;
                }
            });
    });
    interviewRoundGroup.addEventListener('click', (event) => {
        if (event.target.classList.contains('option-btn')) {
            interviewRoundGroup.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
        }
    });

    // --- START SESSION ---
    startInterviewBtn.addEventListener('click', () => {
        showScreen('interview-screen');
        chatWindow.innerHTML = '';
        interviewState = 'ongoing';
        endInterviewBtn.innerHTML = '<i class="fas fa-flag-checkered"></i> End Session';
        [thinkBtn, repeatBtn].forEach(btn => btn.style.display = 'inline-flex');
        startVideo();
        const payload = {
            resume_text: resumeText,
            job_title: jobTitleSelect.value,
            interview_round: document.querySelector('#interview-round .option-btn.active').dataset.value
        };
        fetch('/start_interview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(res => res.json()).then(data => {
            addMessageToChat(data.message, 'ai');
            speak(data.message);
        });
    });

    // --- WEBCAM & SPEECH ---
    function startVideo() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    userVideo.srcObject = stream;
                    localStream = stream;
                })
                .catch(err => {
                    console.error("Webcam error:", err);
                    addMessageToChat("Error: Could not access your webcam. Please check permissions.", "ai");
                });
        }
    }

    function speak(text) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.onstart = () => {
            aiAvatar.src = AVATAR_SPEAK_URL;
            aiAvatar.classList.add('speaking');
            micStatus.textContent = "AI is speaking...";
            micBtn.disabled = false; // User can interrupt
        };
        utterance.onend = () => {
            aiAvatar.src = AVATAR_LISTEN_URL;
            aiAvatar.classList.remove('speaking');
            micStatus.textContent = "Click mic to answer";
            [micBtn, thinkBtn, repeatBtn].forEach(btn => btn.disabled = false);
        };
        speechSynthesis.speak(utterance);
    }
    
    // --- CHAT & RECOGNITION ---
    function addMessageToChat(message, sender, isFinal = true) {
        if (sender === 'user' && !isFinal) {
            if (!currentTranscriptElement) {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message user-message';
                const p = document.createElement('p');
                messageDiv.appendChild(p);
                chatWindow.appendChild(messageDiv);
                currentTranscriptElement = p;
            }
            currentTranscriptElement.textContent = message;
        } else {
            currentTranscriptElement = null; // Finalize the message
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${sender}-message`;
            messageDiv.innerHTML = marked.parse(message); 
            chatWindow.appendChild(messageDiv);
        }
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true; // Keep listening until stopped
        recognition.interimResults = true; // Get live results
        recognition.lang = 'en-US';

        micBtn.addEventListener('click', () => {
            if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
                return;
            }

            if (isRecording) {
                recognition.stop();
            } else {
                if (micBtn.disabled) return;
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerDisplay.style.display = 'none';
                }
                micBtn.classList.add('active');
                micStatus.textContent = "Listening... (Click again to stop)";
                recognition.start();
            }
        });

        recognition.onstart = () => {
            isRecording = true;
        };

        recognition.onresult = (event) => {
            let interim_transcript = '';
            let final_transcript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final_transcript += event.results[i][0].transcript;
                } else {
                    interim_transcript += event.results[i][0].transcript;
                }
            }
            addMessageToChat(final_transcript + interim_transcript, 'user', false);
        };

        recognition.onend = () => {
            isRecording = false;
            micBtn.classList.remove('active');
            micStatus.textContent = "Click mic to answer";
            
            const finalTranscript = currentTranscriptElement ? currentTranscriptElement.textContent.trim() : "";

            if (finalTranscript) {
                currentTranscriptElement = null; // Lock in the final transcript
                micStatus.textContent = "Thinking...";
                aiAvatar.src = AVATAR_THINK_URL;
                micBtn.disabled = true;
                
                fetch('/ask_question', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: finalTranscript })
                }).then(res => res.json()).then(data => {
                    addMessageToChat(data.message, 'ai');
                    speak(data.message);
                });
            }
        };

    } else {
        micStatus.textContent = "Speech recognition not supported.";
    }

    // --- INTERVIEW CONTROLS ---
    thinkBtn.addEventListener('click', () => {
        let timeLeft = 30;
        timerDisplay.textContent = timeLeft;
        timerDisplay.style.display = 'flex';
        [micBtn, thinkBtn, repeatBtn].forEach(btn => btn.disabled = true);
        micStatus.textContent = "Taking a moment to think...";
        timerInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                timerDisplay.style.display = 'none';
                [micBtn, thinkBtn, repeatBtn].forEach(btn => btn.disabled = false);
                micStatus.textContent = "Time's up! Click mic to answer.";
            }
        }, 1000);
    });
    repeatBtn.addEventListener('click', () => {
        if (repeatBtn.disabled) return;
        addMessageToChat("Could you please repeat the question?", 'user');
        micStatus.textContent = "Thinking...";
        fetch('/ask_question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: "Can you please rephrase or repeat the last question?" })
        }).then(res => res.json()).then(data => {
            addMessageToChat(data.message, 'ai');
            speak(data.message);
        });
    });

    // --- END SESSION & FEEDBACK FLOW ---
    endInterviewBtn.addEventListener('click', () => {
        speechSynthesis.cancel();
        if (recognition && isRecording) {
            recognition.stop();
        }
        if (interviewState === 'ongoing') {
            micStatus.textContent = "Preparing final questions...";
            fetch('/initiate_final_phase', { method: 'POST' })
                .then(res => res.json()).then(data => {
                    if (data.message) {
                        addMessageToChat(data.message, 'ai');
                        speak(data.message);
                        interviewState = 'final_questions';
                        endInterviewBtn.innerHTML = '<i class="fas fa-file-alt"></i> Finish & Get Report';
                        [thinkBtn, repeatBtn].forEach(btn => btn.style.display = 'none');
                    }
                });
        } else if (interviewState === 'final_questions') {
            micStatus.textContent = "Generating your report...";
            fetch('/get_feedback', { method: 'POST' })
                .then(res => res.json()).then(data => {
                    showScreen('feedback-screen');
                    if (data.error) {
                        feedbackContent.innerHTML = `<p>Error generating report: ${data.error}</p>`;
                    } else {
                        feedbackContent.innerHTML = marked.parse(data.feedback);
                    }
                });
        }
    });

    // --- RESTART ---
    restartBtn.addEventListener('click', () => {
        showScreen('welcome-screen');
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        goToSetupBtn.disabled = true;
        hardwareStatus.textContent = "";
        hardwareTestArea.style.display = 'none';
        startInterviewBtn.disabled = true;
        uploadStatus.textContent = '';
        resumeFile.value = '';
    });
});