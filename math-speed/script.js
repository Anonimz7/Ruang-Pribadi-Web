        // Variabel game
        let score = 0;
        let streak = 0;
        let time = 0;
        let timer;
        let currentProblem = {};
        let isPlaying = false;
        let isPaused = false;
        let totalQuestions = 0;
        let gameMode = 'unlimited';
        let timeLimit = 120; // 2 menit default (dalam detik)
        let questionLimit = 10;
        let currentDifficulty = 'easy';
        let answerTimes = []; // Untuk menyimpan waktu menjawab tiap soal
        let darkMode = false;
        
        // Elemen DOM
        const problemEl = document.getElementById('problem');
        const answerEl = document.getElementById('answer');
        const submitBtn = document.getElementById('submitBtn');
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const stopBtn = document.getElementById('stopBtn');
        const resumeBtn = document.getElementById('resumeBtn');
        const restartBtn = document.getElementById('restartBtn');
        const timerEl = document.getElementById('timer');
        const scoreEl = document.getElementById('score');
        const streakEl = document.getElementById('streak');
        const operationEl = document.getElementById('operation');
        const levelEl = document.getElementById('level');
        const progressBar = document.getElementById('progress-bar');
        const pauseOverlay = document.getElementById('pauseOverlay');
        const resultsContainer = document.getElementById('resultsContainer');
        const resultsStats = document.getElementById('resultsStats');
        const difficultyBadge = document.getElementById('difficultyBadge');
        const modeRadios = document.querySelectorAll('.mode-radio');
        const timeLimitInput = document.getElementById('time-limit');
        const questionLimitInput = document.getElementById('question-limit');
        const darkModeToggle = document.getElementById('darkModeToggle');
        
        // Event listeners
        startBtn.addEventListener('click', startGame);
        pauseBtn.addEventListener('click', pauseGame);
        stopBtn.addEventListener('click', stopGame);
        resumeBtn.addEventListener('click', resumeGame);
        restartBtn.addEventListener('click', restartGame);
        submitBtn.addEventListener('click', checkAnswer);
        answerEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                checkAnswer();
            }
        });
        darkModeToggle.addEventListener('click', toggleDarkMode);
        
        // Cek preferensi dark mode dari local storage
        function checkDarkModePreference() {
            const savedMode = localStorage.getItem('darkMode');
            if (savedMode === 'enabled') {
                enableDarkMode();
            }
        }
        
        // Toggle dark mode
        function toggleDarkMode() {
            darkMode = !darkMode;
            if (darkMode) {
                enableDarkMode();
            } else {
                disableDarkMode();
            }
        }
        
        // Enable dark mode
        function enableDarkMode() {
            document.body.classList.add('dark-mode');
            darkModeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('darkMode', 'enabled');
            darkMode = true;
        }
        
        // Disable dark mode
        function disableDarkMode() {
            document.body.classList.remove('dark-mode');
            darkModeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('darkMode', 'disabled');
            darkMode = false;
        }
        
        // Mode selection
        modeRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                gameMode = this.value;
                
                // Sembunyikan semua input mode
                document.querySelectorAll('.mode-input').forEach(input => {
                    input.style.display = 'none';
                });
                
                // Tampilkan input yang relevan
                if (this.id === 'mode-time') {
                    timeLimitInput.style.display = 'block';
                } else if (this.id === 'mode-questions') {
                    questionLimitInput.style.display = 'block';
                }
            });
        });
        
        // Fungsi untuk memulai game
        function startGame() {
            // Dapatkan pengaturan mode
            if (gameMode === 'time') {
                timeLimit = parseInt(timeLimitInput.value) * 60;
                time = timeLimit; // Set waktu awal untuk countdown
            } else if (gameMode === 'questions') {
                questionLimit = parseInt(questionLimitInput.value);
                time = 0; // Reset waktu untuk mode jumlah soal
            } else {
                time = 0; // Reset waktu untuk mode tanpa batas
            }
            
            currentDifficulty = levelEl.value;
            
            // Reset game state
            score = 0;
            streak = 0;
            totalQuestions = 0;
            isPaused = false;
            answerTimes = [];
            
            scoreEl.textContent = score;
            streakEl.textContent = streak;
            updateTimerDisplay();
            progressBar.style.width = '0%';
            pauseOverlay.classList.remove('active');
            
            // Sembunyikan hasil dan tampilkan game
            resultsContainer.style.display = 'none';
            document.querySelector('.problem-container').style.display = 'block';
            document.querySelector('.stats').style.display = 'grid';
            
            // Update tombol
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            stopBtn.disabled = false;
            submitBtn.disabled = false;
            answerEl.disabled = false;
            
            isPlaying = true;
            
            // Mulai timer
            clearInterval(timer);
            
            if (gameMode === 'time') {
                // Mode countdown untuk batas waktu
                timer = setInterval(function() {
                    time--;
                    updateTimerDisplay();
                    
                    // Update progress bar
                    const progress = ((timeLimit - time) / timeLimit) * 100;
                    progressBar.style.width = `${Math.min(progress, 100)}%`;
                    
                    // Cek jika waktu habis
                    if (time <= 0) {
                        stopGame();
                    }
                }, 1000);
            } else {
                // Mode timer normal untuk lainnya
                timer = setInterval(function() {
                    time++;
                    updateTimerDisplay();
                    
                    // Update progress bar untuk mode jumlah soal
                    if (gameMode === 'questions') {
                        const progress = (totalQuestions / questionLimit) * 100;
                        progressBar.style.width = `${Math.min(progress, 100)}%`;
                    }
                }, 1000);
            }
            
            generateProblem();
            answerEl.focus();
            
            // Catat waktu mulai soal
            answerTimes.push({
                startTime: gameMode === 'time' ? timeLimit : 0,
                answerTime: 0
            });
        }
        
        // Fungsi untuk update tampilan timer
        function updateTimerDisplay() {
            let displayTime = time;
            if (gameMode === 'time') {
                // Pastikan waktu tidak negatif
                displayTime = Math.max(0, time);
            }
            
            const minutes = Math.floor(displayTime / 60).toString().padStart(2, '0');
            const seconds = (displayTime % 60).toString().padStart(2, '0');
            timerEl.textContent = `${minutes}:${seconds}`;
            
            // Warna merah jika waktu hampir habis (mode countdown)
            if (gameMode === 'time' && time <= 10) {
                timerEl.style.color = 'var(--danger)';
                timerEl.style.animation = 'pulse 0.5s infinite alternate';
            } else {
                timerEl.style.color = 'var(--danger)';
                timerEl.style.animation = 'none';
            }
        }
        
        // Fungsi untuk pause game
        function pauseGame() {
            if (!isPlaying) return;
            
            isPaused = true;
            clearInterval(timer);
            pauseOverlay.classList.add('active');
            answerEl.disabled = true;
            submitBtn.disabled = true;
            
            // Update tombol
            pauseBtn.disabled = true;
            stopBtn.disabled = false;
        }
        
        // Fungsi untuk resume game
        function resumeGame() {
            if (!isPlaying || !isPaused) return;
            
            isPaused = false;
            pauseOverlay.classList.remove('active');
            answerEl.disabled = false;
            submitBtn.disabled = false;
            
            // Update tombol
            pauseBtn.disabled = false;
            stopBtn.disabled = false;
            
            // Lanjutkan timer
            if (gameMode === 'time') {
                timer = setInterval(function() {
                    time--;
                    updateTimerDisplay();
                    
                    // Update progress bar
                    const progress = ((timeLimit - time) / timeLimit) * 100;
                    progressBar.style.width = `${Math.min(progress, 100)}%`;
                    
                    // Cek jika waktu habis
                    if (time <= 0) {
                        stopGame();
                    }
                }, 1000);
            } else {
                timer = setInterval(function() {
                    time++;
                    updateTimerDisplay();
                    
                    // Update progress bar untuk mode jumlah soal
                    if (gameMode === 'questions') {
                        const progress = (totalQuestions / questionLimit) * 100;
                        progressBar.style.width = `${Math.min(progress, 100)}%`;
                    }
                }, 1000);
            }
            
            answerEl.focus();
        }
        
        // Fungsi untuk stop game
        function stopGame() {
            isPlaying = false;
            isPaused = false;
            clearInterval(timer);
            
            // Update tombol
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = true;
            submitBtn.disabled = true;
            answerEl.disabled = true;
            
            pauseOverlay.classList.remove('active');
            
            // Tampilkan hasil
            showFinalResults();
        }
        
        // Fungsi untuk restart game
        function restartGame() {
            // Sembunyikan hasil dan tampilkan game area
            resultsContainer.style.display = 'none';
            document.querySelector('.problem-container').style.display = 'block';
            document.querySelector('.stats').style.display = 'grid';
            
            // Mulai game baru
            startGame();
        }
        
        // Fungsi untuk menghasilkan soal
        function generateProblem() {
            const operation = operationEl.value;
            const level = levelEl.value;
            
            let num1, num2, op;
            
            // Tentukan operator jika random
            if (operation === 'random') {
                const ops = ['+', '-', '*', '/'];
                op = ops[Math.floor(Math.random() * ops.length)];
            } else {
                op = operation;
            }
            
            // Generate angka berdasarkan tingkat kesulitan
            switch(level) {
                case 'easy':
                    num1 = Math.floor(Math.random() * 10) + 1;
                    num2 = Math.floor(Math.random() * 10) + 1;
                    
                    if (op === '-') {
                        if (num1 < num2) [num1, num2] = [num2, num1];
                    }
                    
                    if (op === '/') {
                        num2 = Math.floor(Math.random() * 5) + 1;
                        num1 = num2 * (Math.floor(Math.random() * 5) + 1);
                    }
                    break;
                    
                case 'medium':
                    num1 = Math.floor(Math.random() * 50) + 1;
                    num2 = Math.floor(Math.random() * 50) + 1;
                    
                    if (op === '-') {
                        if (num1 < num2) [num1, num2] = [num2, num1];
                    }
                    
                    if (op === '/') {
                        num2 = Math.floor(Math.random() * 10) + 1;
                        num1 = num2 * (Math.floor(Math.random() * 10) + 1);
                    }
                    break;
                    
                case 'hard':
                    num1 = Math.floor(Math.random() * 100) + 1;
                    num2 = Math.floor(Math.random() * 100) + 1;
                    
                    if (op === '-') {
                        if (num1 < num2) [num1, num2] = [num2, num1];
                    }
                    
                    if (op === '/') {
                        num2 = Math.floor(Math.random() * 12) + 1;
                        num1 = num2 * (Math.floor(Math.random() * 20) + 1);
                    }
                    break;
                    
                case 'super-hard':
                    num1 = Math.floor(Math.random() * 500) + 1;
                    num2 = Math.floor(Math.random() * 500) + 1;
                    
                    if (op === '-') {
                        if (num1 < num2) [num1, num2] = [num2, num1];
                    }
                    
                    if (op === '/') {
                        num2 = Math.floor(Math.random() * 20) + 1;
                        num1 = num2 * (Math.floor(Math.random() * 25) + 1);
                    }
                    break;
                    
                case 'monster':
                    num1 = Math.floor(Math.random() * 1000) + 1;
                    num2 = Math.floor(Math.random() * 1000) + 1;
                    
                    if (op === '-') {
                        if (num1 < num2) [num1, num2] = [num2, num1];
                    }
                    
                    if (op === '/') {
                        num2 = Math.floor(Math.random() * 30) + 1;
                        num1 = num2 * (Math.floor(Math.random() * 35) + 1);
                    }
                    break;
            }
            
            // Simpan soal saat ini
            currentProblem = {
                num1: num1,
                num2: num2,
                op: op,
                answer: calculateAnswer(num1, num2, op)
            };
            
            // Tampilkan soal
            const operatorSymbol = getOperatorSymbol(op);
            problemEl.textContent = `${num1} ${operatorSymbol} ${num2} = ?`;
            answerEl.value = '';
            
            // Catat waktu mulai soal (untuk menghitung waktu menjawab)
            if (gameMode === 'time') {
                answerTimes.push({
                    startTime: time,
                    answerTime: 0
                });
            } else {
                answerTimes.push({
                    startTime: time,
                    answerTime: 0
                });
            }
        }
        
        // Fungsi untuk menghitung jawaban
        function calculateAnswer(num1, num2, op) {
            switch(op) {
                case '+': return num1 + num2;
                case '-': return num1 - num2;
                case '*': return num1 * num2;
                case '/': return num1 / num2;
                default: return 0;
            }
        }
        
        // Fungsi untuk mendapatkan simbol operator
        function getOperatorSymbol(op) {
            switch(op) {
                case '+': return '+';
                case '-': return '-';
                case '*': return '×';
                case '/': return '÷';
                default: return op;
            }
        }
        
        // Fungsi untuk memeriksa jawaban
        function checkAnswer() {
            if (!isPlaying || isPaused) return;
            
            // Catat waktu menjawab
            const lastAnswer = answerTimes[answerTimes.length - 1];
            if (gameMode === 'time') {
                lastAnswer.answerTime = lastAnswer.startTime - time;
            } else {
                lastAnswer.answerTime = time - lastAnswer.startTime;
            }
            
            totalQuestions++;
            const userAnswer = parseFloat(answerEl.value);
            
            if (isNaN(userAnswer)) {
                alert('Masukkan jawaban yang valid!');
                return;
            }
            
            // Bulatkan untuk menghindari kesalahan floating point
            const correctAnswer = currentProblem.answer;
            const isCorrect = Math.abs(userAnswer - correctAnswer) < 0.0001;
            
            if (isCorrect) {
                // Hitung skor berdasarkan tingkat kesulitan
                let points = 10;
                switch(currentDifficulty) {
                    case 'medium': points = 15; break;
                    case 'hard': points = 20; break;
                    case 'super-hard': points = 30; break;
                    case 'monster': points = 50; break;
                }
                
                score += points;
                streak++;
                
                // Bonus untuk streak
                if (streak >= 5) {
                    score += Math.floor(points / 2);
                }
                
                // Animasi feedback
                problemEl.style.color = '#4cc9f0';
            } else {
                streak = 0;
                
                // Animasi feedback
                problemEl.style.color = '#f72585';
            }
            
            // Reset warna setelah 300ms
            setTimeout(() => {
                problemEl.style.color = 'var(--text-color)';
            }, 300);
            
            // Update tampilan
            scoreEl.textContent = score;
            streakEl.textContent = streak;
            
            // Cek apakah game harus berakhir (untuk mode jumlah soal)
            if (gameMode === 'questions' && totalQuestions >= questionLimit) {
                stopGame();
                return;
            }
            
            // Generate soal baru
            generateProblem();
            answerEl.focus();
        }
        
        // Fungsi untuk menghitung rata-rata waktu menjawab
        function calculateAverageAnswerTime() {
            if (answerTimes.length === 0) return 0;
            
            let totalTime = 0;
            let count = 0;
            
            // Hitung total waktu menjawab semua soal
            for (let i = 0; i < answerTimes.length; i++) {
                if (answerTimes[i].answerTime > 0) {
                    totalTime += answerTimes[i].answerTime;
                    count++;
                }
            }
            
            return count > 0 ? (totalTime / count).toFixed(1) : 0;
        }
        
        // Fungsi untuk menampilkan hasil akhir
        function showFinalResults() {
            const minutes = Math.floor(time / 60);
            const seconds = time % 60;
            const timeString = `${minutes > 0 ? minutes + ' menit ' : ''}${seconds} detik`;
            const averageAnswerTime = calculateAverageAnswerTime();
            
            // Update badge kesulitan
            difficultyBadge.className = 'difficulty-label';
            difficultyBadge.classList.add(currentDifficulty);
            difficultyBadge.textContent = {
                'easy': 'Mudah',
                'medium': 'Sedang',
                'hard': 'Sulit',
                'super-hard': 'Super Sulit',
                'monster': 'Monster'
            }[currentDifficulty];
            
            // Isi statistik hasil
            resultsStats.innerHTML = `
                <div class="result-stat">
                    <div class="result-value">${score}</div>
                    <div class="result-label">Total Skor</div>
                </div>
                <div class="result-stat">
                    <div class="result-value">${totalQuestions}</div>
                    <div class="result-label">Soal Terjawab</div>
                </div>
                <div class="result-stat">
                    <div class="result-value">${timeString}</div>
                    <div class="result-label">Waktu Bermain</div>
                </div>
                <div class="result-stat">
                    <div class="result-value">${averageAnswerTime}s</div>
                    <div class="result-label">Rata-rata Waktu/Soal</div>
                </div>
                <div class="result-stat">
                    <div class="result-value">${totalQuestions > 0 ? (score / totalQuestions).toFixed(1) : 0}</div>
                    <div class="result-label">Rata-rata Poin</div>
                </div>
                <div class="result-stat">
                    <div class="result-value">${time > 0 ? Math.floor(totalQuestions / time * 60) : 0}</div>
                    <div class="result-label">Soal/Menit</div>
                </div>
                <div class="result-stat">
                    <div class="result-value">${streak}</div>
                    <div class="result-label">Streak Terakhir</div>
                </div>
                <div class="result-stat">
                    <div class="result-value">${currentDifficulty === 'easy' ? 10 : 
                                              currentDifficulty === 'medium' ? 15 : 
                                              currentDifficulty === 'hard' ? 20 : 
                                              currentDifficulty === 'super-hard' ? 30 : 50}</div>
                    <div class="result-label">Poin/Soal</div>
                </div>
            `;
            
            // Sembunyikan game area dan tampilkan hasil
            document.querySelector('.problem-container').style.display = 'none';
            document.querySelector('.stats').style.display = 'none';
            resultsContainer.style.display = 'block';
        }
        
        // Inisialisasi tampilan input mode
        document.getElementById('mode-time').addEventListener('change', function() {
            timeLimitInput.style.display = this.checked ? 'block' : 'none';
            questionLimitInput.style.display = 'none';
        });
        
        document.getElementById('mode-questions').addEventListener('change', function() {
            questionLimitInput.style.display = this.checked ? 'block' : 'none';
            timeLimitInput.style.display = 'none';
        });
        
        document.getElementById('mode-unlimited').addEventListener('change', function() {
            timeLimitInput.style.display = 'none';
            questionLimitInput.style.display = 'none';
        });

        // Cek dark mode preference saat halaman dimuat
        checkDarkModePreference();