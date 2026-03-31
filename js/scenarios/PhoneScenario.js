export default class PhoneScenario {
    constructor() {
        this.name = "Distracted Driving (Phone)";
        this.isActive = false;
        this.state = 'idle'; // 狀態: 'idle' (閒置), 'ringing' (響鈴中), 'connected' (通話中)
        this.timer = 0;
        this.gameManager = null;

        // ★ 修正：移除 hasTriggered，改用「冷卻時間」機制
        this.lastTriggerTime = 0;    // 紀錄最後一次觸發的時間
        this.cooldownTime = 10;

        // --- 設定時間參數 ---
        this.ringDuration = 5; // 響鈴 5 秒沒接掛斷
        this.talkDuration = 5; // 接聽後 5 秒掛斷

        // --- 初始化音效 ---
        this.setupAudio();
        
        // --- 初始化 UI (左下角) ---
        this.createPhoneUI();
    }

setupAudio() {
        // 使用 Google Actions 提供的免費開源音效作為測試，解決 404 報錯問題
        // 這是真實的電話鈴聲
        this.ringtone = new Audio('https://actions.google.com/sounds/v1/alarms/phone_ring.ogg'); 
        this.ringtone.loop = true;

        this.musicTracks = [
            // 隨便塞幾個不同的情境音效當作「音樂」測試
            'https://actions.google.com/sounds/v1/water/waves_crashing.ogg', // 假裝是聽海浪放鬆音樂
            'https://actions.google.com/sounds/v1/science_fiction/static_loop.ogg', // 假裝是廣播沒訊號的雜音
            'https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg'  // 搞笑彈跳音效
        ];
        this.currentMusic = null;
    }

    createPhoneUI() {
        let existingUI = document.getElementById('phone-ui-container');
        if (existingUI) {
            existingUI.remove();
        }

        this.uiContainer = document.createElement('div');
        this.uiContainer.id = 'phone-ui-container'; 
        Object.assign(this.uiContainer.style, {
            position: 'absolute', bottom: '20px', left: '20px',
            width: '220px', padding: '15px',
            backgroundColor: 'rgba(20, 20, 20, 0.9)', border: '2px solid #444',
            borderRadius: '10px', color: 'white', fontFamily: 'Arial, sans-serif',
            display: 'none', flexDirection: 'column', alignItems: 'center',
            zIndex: '5000', boxShadow: '0 0 10px rgba(0,0,0,0.5)'
        });

        this.uiContainer.innerHTML = `
            <div id="phone-title" style="font-size: 14px; color: #aaa; margin-bottom: 5px;">來電中...</div>
            <div id="phone-caller" style="font-size: 20px; font-weight: bold; margin-bottom: 15px;">媽媽</div>
            <div id="phone-buttons" style="display: flex; gap: 15px; width: 100%; justify-content: center;">
                <button id="btn-decline" style="padding: 8px 15px; background: #ff4444; color: white; border: none; border-radius: 20px; cursor: pointer; font-weight: bold;">拒接</button>
                <button id="btn-answer" style="padding: 8px 15px; background: #44ff44; color: black; border: none; border-radius: 20px; cursor: pointer; font-weight: bold;">接聽</button>
            </div>
            <div id="phone-timer" style="margin-top: 10px; font-size: 12px; color: #00ff00; display: none;">00:05</div>
        `;

        document.body.appendChild(this.uiContainer);

        const btnDecline = this.uiContainer.querySelector('#btn-decline');
        const btnAnswer = this.uiContainer.querySelector('#btn-answer');

        btnDecline.onclick = (e) => {
            e.stopPropagation();
            this.handleDecline();
        };
        btnAnswer.onclick = (e) => {
            e.stopPropagation();
            this.handleAnswer();
        };
        
        this.domTitle = this.uiContainer.querySelector('#phone-title');
        this.domButtons = this.uiContainer.querySelector('#phone-buttons');
        this.domTimer = this.uiContainer.querySelector('#phone-timer');
    }

    start(scene, camera, gameManager) {
        if (this.isActive) return;

        // ★ 新增：檢查冷卻時間。如果距離上次觸發不到 15 秒，就直接略過
        const now = Date.now();
        if (now - this.lastTriggerTime < this.cooldownTime) {
            return; 
        }

        this.gameManager = gameManager;

        const speed = this.gameManager.player.userData.currentSpeed || 0;
        
        if (speed > 0.5) return;

        console.log("📱 手機事件觸發：響鈴中");
        this.isActive = true;
        
        // ★ 記錄這次成功觸發的時間
        this.lastTriggerTime = now; 
        
        this.state = 'ringing';
        this.timer = 0;

        this.uiContainer.style.display = 'flex';
        this.domTitle.innerText = "來電中...";
        this.domButtons.style.display = 'flex'; 
        this.domTimer.style.display = 'none';

        this.ringtone.currentTime = 0;
        this.ringtone.play().catch(e => console.log("需使用者互動才能播放音效"));
    }

    handleAnswer() {
        if (this.state !== 'ringing') return;

        console.log("📞 接聽電話：播放音樂");
        this.state = 'connected';
        this.timer = 0; 

        this.domTitle.innerText = "通話中 🎵";
        this.domButtons.style.display = 'none'; 
        this.domTimer.style.display = 'block';

        this.ringtone.pause();
        this.playRandomMusic();
        
        if (this.gameManager && this.gameManager.dataCollector) {
            if (typeof this.gameManager.dataCollector.recordEvent === 'function') {
                this.gameManager.dataCollector.recordEvent("手機_接聽"); 
            } else if (typeof this.gameManager.dataCollector.recordScenario === 'function') {
                this.gameManager.dataCollector.recordScenario("危險動作：行駛中接聽手機"); 
            }
        }
    }

handleDecline() {
        if (this.gameManager && this.gameManager.dataCollector) {
            if (typeof this.gameManager.dataCollector.recordEvent === 'function') {
                this.gameManager.dataCollector.recordEvent("手機_拒接"); 
            } else if (typeof this.gameManager.dataCollector.recordScenario === 'function') {
                this.gameManager.dataCollector.recordScenario("安全駕駛：拒接電話"); 
            }
        }

        // ★ 新增：玩家主動拒接，記錄事件成功！
        if (this.gameManager && typeof this.gameManager.recordEventSuccess === 'function') {
            this.gameManager.recordEventSuccess('phone', null);
        }

        this.stop();
    }
    
    playRandomMusic() {
        const randomIndex = Math.floor(Math.random() * this.musicTracks.length);
        const src = this.musicTracks[randomIndex];
        
        this.currentMusic = new Audio(src);
        this.currentMusic.volume = 0.8;
        this.currentMusic.play().catch(e => console.log("音樂播放失敗"));
    }

update(deltaTime) {
        if (!this.isActive) return true; 

        this.timer += deltaTime;

        if (this.state === 'ringing') {
            if (this.timer > this.ringDuration) {
                console.log("⌛ 響鈴超時未接");
                
                // ★ 新增：玩家無視響鈴直到超時，記錄事件成功！
                if (this.gameManager && typeof this.gameManager.recordEventSuccess === 'function') {
                    this.gameManager.recordEventSuccess('phone', null);
                }

                this.stop();
                return true;
            }
        }
        else if (this.state === 'connected') {
            const remaining = Math.max(0, Math.ceil(this.talkDuration - this.timer));
            this.domTimer.innerText = `通話結束倒數: ${remaining}`;

            if (this.timer > this.talkDuration) {
                console.log("⌛ 通話時間結束");
                this.stop();
                return true;
            }
        }
        
        const speed = this.gameManager.player.userData.currentSpeed || 0;
        if (speed > 5.0) {
             console.log("🚗 車輛移動，強制結束通話");
             
             // ★ 新增：如果是在「響鈴中」專心開車而中斷事件，也算成功！(如果是「通話中」移動則不算)
             if (this.state === 'ringing' && this.gameManager && typeof this.gameManager.recordEventSuccess === 'function') {
                 this.gameManager.recordEventSuccess('phone', null);
             }

             this.stop();
             return true;
        }

        return false; 
    }

    stop() {
        this.isActive = false;
        this.state = 'idle';

        if (this.uiContainer) {
            this.uiContainer.style.display = 'none';
        }

        if (this.ringtone) {
            this.ringtone.pause();
            this.ringtone.currentTime = 0;
        }

        if (this.currentMusic) {
            this.currentMusic.pause();
            this.currentMusic = null;
        }
    }
}