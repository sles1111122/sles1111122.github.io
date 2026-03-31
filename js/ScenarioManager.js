import JaywalkingScenario from './scenarios/Jaywalking.js';
import TruckTurnScenario from './scenarios/TruckTurn.js';
import AmbulanceScenario from './scenarios/Ambulance.js';
import ConstructionSystem from './scenarios/ConstructionSystem.js'; // 🌟 加入交通路段(施工)

export class ScenarioManager {
    // 🌟 整合你的參數：加入 dataCollector 獨立實例，並相容 trafficJudge
    constructor(scene, camera, gameManager, sceneData, dataCollector, trafficJudge) {
        this.scene = scene;
        this.camera = camera;
        this.gameManager = gameManager;
        this.sceneData = sceneData; 
        
        // 相容寫法：如果你傳的是 dataCollector 就用，否則從 gameManager 裡面抓
        this.dataCollector = dataCollector || (gameManager ? gameManager.dataCollector : null); 
        this.trafficJudge = trafficJudge; 

        // 🌟 依照你的要求修改順序：貨車 -> 救護車 -> 交通路段 -> 行人
        // 並且在這裡直接綁定你的 eventType，完美銜接無敵星星系統
        this.scenarioFactories = [
            () => {
                const s = new TruckTurnScenario(this.sceneData.intersections, this.sceneData.pedestrians, this.sceneData.bounds || null);
                s.eventType = 'truck';
                return s;
            },
            () => {
                const s = new AmbulanceScenario(this.sceneData.intersections, this.sceneData.pedestrians, this.sceneData.bounds || null, this.trafficJudge);
                s.eventType = 'ambulance';
                return s;
            },
            () => {
                const s = new ConstructionSystem(this.trafficJudge);
                s.eventType = 'construction';
                return s;
            },
            () => {
                const s = new JaywalkingScenario();
                s.eventType = 'pedestrian';
                return s;
            }
        ];

        this.currentIndex = 0; 
        this.currentScenario = null;
        this.currentEventType = null;

        // ⏱️ 設定絕對的規律週期
        this.triggerInterval = 20000; // 每 20 秒固定發生一次
        this.lastTriggerTime = Date.now(); 
        
        this.createCountdownUI();
        this.setupDebugKeys();
    }

    createCountdownUI() {
        this.countdownUI = document.createElement('div');
        this.countdownUI.id = 'scenario-countdown';
        this.countdownUI.style.position = 'absolute';
        this.countdownUI.style.top = '60px'; 
        this.countdownUI.style.width = '100%';
        this.countdownUI.style.textAlign = 'center';
        this.countdownUI.style.color = '#00ff00';
        this.countdownUI.style.fontFamily = 'Arial, sans-serif';
        this.countdownUI.style.fontWeight = 'bold';
        this.countdownUI.style.fontSize = '24px';
        this.countdownUI.style.textShadow = '2px 2px 4px #000000'; 
        this.countdownUI.style.pointerEvents = 'none'; 
        this.countdownUI.style.zIndex = '100';
        document.body.appendChild(this.countdownUI);
    }

    setupDebugKeys() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentScenario) {
                this.stopCurrentScenario();
                return;
            }
            if (e.key.toLowerCase() === 'n') {
                this.forceTriggerNext();
            }
        });
    }

    stopCurrentScenario() {
        if (this.currentScenario) {
            try { this.currentScenario.stop(this.scene); } catch(e) {}
            
            // 如果事件自然結束/被切換，而玩家都沒反應，記一筆「失敗(Miss)」
            if (this.dataCollector && typeof this.dataCollector.recordMiss === 'function') {
                this.dataCollector.recordMiss();
            }
            this.currentScenario = null;
        }
    }

    // 更新中文名稱，加入施工路段
    getScenarioChineseName(scenario) {
        const name = scenario.constructor.name;
        if (name.includes('TruckTurn')) return "大卡車內輪差盲區";
        if (name.includes('Ambulance')) return "救護車緊急通行";
        if (name.includes('Construction')) return "施工路段禁止通行";
        if (name.includes('Jaywalking')) return "行人違規橫穿";
        return name;
    }

    update(dt, currentNSState, currentEWState) {
        const now = Date.now();
        const timeElapsed = now - this.lastTriggerTime;

        if (this.currentScenario) {
            this.countdownUI.innerText = `🚨 測試事件進行中：${this.getScenarioChineseName(this.currentScenario)}`;
            this.countdownUI.style.color = '#ffaa00'; 

            try {
                const isFinished = this.currentScenario.update(dt, currentNSState, currentEWState, this.camera);
                if (isFinished) {
                    console.log(`⚠️ 事件 ${this.currentScenario.constructor.name} 結束`);
                    this.stopCurrentScenario(); 
                }
            } catch (error) {
                console.error("更新事件時發生錯誤，強制結束:", error);
                this.stopCurrentScenario(); 
            }
        } 
        else {
            const timeLeft = Math.max(0, this.triggerInterval - timeElapsed);
            const secondsLeft = Math.ceil(timeLeft / 1000);
            this.countdownUI.innerText = `⏳ 距離下一次突發測試：${secondsLeft} 秒`;
            this.countdownUI.style.color = '#00ff00'; 
        }

        if (timeElapsed >= this.triggerInterval) {
            this.triggerNextScenario(now);
        }
    }

    forceTriggerNext() {
        this.triggerNextScenario(Date.now());
    }

    triggerNextScenario(currentTime) {
        if (this.scenarioFactories.length === 0) return;

        if (this.currentScenario) {
            this.stopCurrentScenario();
        }

        const createNewScenario = this.scenarioFactories[this.currentIndex];
        this.currentScenario = createNewScenario();
        
try {
            // 🌟 1. 取得 start() 的回傳結果
            const isStarted = this.currentScenario.start(this.scene, this.camera, this.gameManager);
            
            // 🌟 2. 如果事件明確回傳 false，代表它「條件不符，取消生成」了
            if (isStarted === false) {
                console.warn(`⚠️ 事件 ${this.currentScenario.constructor.name} 條件不符取消生成，跳過紀錄。`);
                this.countdownUI.innerText = `⚠️ 條件不符，事件跳過...`;
                this.currentScenario = null; // 丟棄這個失敗的事件
            } 
            // 🌟 3. 只有成功生成 (沒有回傳 false)，才進行紀錄！
            else {
                this.currentEventType = this.currentScenario.eventType || 'pedestrian'; 

                // 通知 GameManager 事件開始！(開啟無敵星星)
                if (this.gameManager && typeof this.gameManager.recordEventStart === 'function') {
                    this.gameManager.recordEventStart(this.currentEventType);
                    console.log(`🛡️ 通知 GameManager：${this.currentEventType} 開始`);
                }
                
                // 紀錄 DataCollector
                const className = this.currentScenario.constructor.name;
                const eventName = this.currentScenario.name || className; 
                
                if (this.dataCollector) {
                    if (typeof this.dataCollector.recordEventTrigger === 'function') {
                        this.dataCollector.recordEventTrigger(eventName);
                        console.log(`📝 已記錄事件：${eventName}`);
                    }
                    if (this.currentScenario.hasReactionTest && typeof this.dataCollector.startTimer === 'function') {
                        this.dataCollector.startTimer(eventName);
                    }
                }
            }

        } catch (error) {
            console.error(`❌ 啟動事件 ${this.currentScenario?.constructor.name} 失敗:`, error);
            this.countdownUI.innerText = `❌ 事件載入失敗，跳過...`;
            this.currentScenario = null; 
        } finally {
            this.currentIndex = (this.currentIndex + 1) % this.scenarioFactories.length;
            this.lastTriggerTime = currentTime; 
        }
    }
}