export class NavigationSystem {
    constructor(gameManager, scene, renderer, playerCamera, cityConfig) {
        this.gameManager = gameManager;
        this.scene = scene;
        this.renderer = renderer;
        this.playerCamera = playerCamera;

        // --- A. 城市與導航設定 ---
        cityConfig = cityConfig || {};
        this.blockSize = cityConfig.blockSize || 100;
        this.citySize = cityConfig.citySize || 2;
        
        this.targetNode = null; 
        this.path = [];         
        this.goalsCompleted = 0; 
        this.maxGoals = 5;      

        // --- B. 小地圖設定 ---
        this.mapSize = 250; 
        this.viewSize = 500; 
        
        this.mapCamera = new THREE.OrthographicCamera(
            -this.viewSize / 2, this.viewSize / 2, 
            this.viewSize / 2, -this.viewSize / 2, 
            1, 1000
        );
        this.mapCamera.position.y = 100; 
        this.mapCamera.lookAt(0, 0, 0);  

        this.createMapUI();
        this.createGoalMarker();
        window.GlobalNavSystem = this;
    }

    createMapUI() {
        // 1. 建立導航外框 (Container)
        this.container = document.createElement('div');
        Object.assign(this.container.style, {
            position: 'absolute', bottom: '20px', right: '20px', 
            width: this.mapSize + 'px', height: this.mapSize + 'px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)', // 半透明黑底
            borderRadius: '15px', border: '3px solid #fff', 
            overflow: 'hidden', zIndex: '1000'
        });
        
        // 北方指針
        this.container.innerHTML = '<div style="position:absolute; top:5px; left:50%; transform:translateX(-50%); color:#aaa; font-weight:bold; font-family:Arial; font-size:12px; z-index:1001;">N</div>';
        document.body.appendChild(this.container);

        // 2. 玩家紅點
        this.redDot = document.createElement('div');
        Object.assign(this.redDot.style, {
            position: 'absolute', top: '50%', left: '50%',
            width: '12px', height: '12px', backgroundColor: 'red',
            borderRadius: '50%', transform: 'translate(-50%, -50%)',
            zIndex: '1002', border: '2px solid white', boxShadow: '0 0 5px red'
        });
        this.container.appendChild(this.redDot);

        // 3. 一般導航面板 (箭頭與距離)
        this.navPanel = document.createElement('div');
        Object.assign(this.navPanel.style, {
            position: 'absolute', top: '20px', left: '0', width: '100%',
            textAlign: 'center', zIndex: '1003', pointerEvents: 'none',
            display: 'block'
        });

        this.navPanel.innerHTML = `
            <div id="nav-arrow" style="font-size: 60px; line-height: 60px; color: yellow; text-shadow: 2px 2px 0 #000;">⬆️</div>
            <div id="nav-text" style="font-size: 24px; color: white; font-weight: bold; text-shadow: 2px 2px 0 #000; margin-top: 5px;">準備出發</div>
            <div id="nav-dist" style="font-size: 18px; color: #00ff00; font-weight: bold; text-shadow: 1px 1px 0 #000; min-height: 24px;"></div>
        `;
        this.container.appendChild(this.navPanel);
        
        this.uiArrow = this.container.querySelector('#nav-arrow');
        this.uiText = this.container.querySelector('#nav-text');
        this.uiDist = this.container.querySelector('#nav-dist');
    }

    // ==========================================
    //  原本的手機控制邏輯已刪除
    // ==========================================

    createGoalMarker() {
        const geo = new THREE.CylinderGeometry(4, 4, 40, 32); 
        const mat = new THREE.MeshPhongMaterial({ 
            color: 0x00ffff, transparent: true, opacity: 0.6, emissive: 0x0088ff 
        });
        this.goalMesh = new THREE.Mesh(geo, mat);
        this.goalMesh.visible = false;
        this.scene.add(this.goalMesh);
    }

    startNextGoal() {
        let tx, tz;
        const currentGrid = this.getCurrentGrid();
        
        const minGrid = 0;
        const maxGrid = 3;
        const range = maxGrid - minGrid + 1; 

        do {
            tx = Math.floor(Math.random() * range) + minGrid;
            tz = Math.floor(Math.random() * range) + minGrid;
        } while (tx === currentGrid.x && tz === currentGrid.z);

        this.targetNode = { x: tx, z: tz };
        this.goalMesh.position.set(tx * this.blockSize, 10, tz * this.blockSize);
        this.goalMesh.visible = true;

        console.log(`📍 新目的地: Grid(${tx}, ${tz})`);
        this.recalculatePath();
    }

    getCurrentGrid() {
        return {
            x: Math.round(this.playerCamera.position.x / this.blockSize),
            z: Math.round(this.playerCamera.position.z / this.blockSize)
        };
    }

    recalculatePath() {
        if (!this.targetNode) return;
        const start = this.getCurrentGrid();
        const end = this.targetNode;

        const queue = [start];
        const cameFrom = {};
        cameFrom[`${start.x},${start.z}`] = null;
        let found = false;

        const minGrid = 0;
        const maxGrid = 3;

        const carDir = new THREE.Vector3();
        this.playerCamera.getWorldDirection(carDir);
        carDir.y = 0; carDir.normalize();

        while (queue.length > 0) {
            const current = queue.shift();
            if (current.x === end.x && current.z === end.z) { found = true; break; }

            const neighbors = [
                { x: current.x + 1, z: current.z }, { x: current.x - 1, z: current.z },
                { x: current.x, z: current.z + 1 }, { x: current.x, z: current.z - 1 }
            ];

            for (let next of neighbors) {
                if (next.x < minGrid || next.x > maxGrid || next.z < minGrid || next.z > maxGrid) {
                    continue;
                }

                if (current.x === start.x && current.z === start.z) {
                    const dirToNext = new THREE.Vector3(
                        next.x - start.x, 
                        0, 
                        next.z - start.z
                    ).normalize();

                    if (carDir.dot(dirToNext) < -0.5) {
                        continue; 
                    }
                }

                const key = `${next.x},${next.z}`;
                if (!(key in cameFrom)) {
                    queue.push(next);
                    cameFrom[key] = current;
                }
            }
        }

        this.path = [];
        if (found) {
            let curr = end;
            while (curr) {
                this.path.push(curr);
                curr = cameFrom[`${curr.x},${curr.z}`];
            }
            this.path.reverse(); 
        } else {
            console.log("⚠️ 無法規劃路徑 (可能需要繞路太遠或死路)");
        }
    }

    checkArrival(dist) {
        if (dist < 15) { 
            this.goalsCompleted++;
            console.log(`🎉 抵達！ (${this.goalsCompleted}/${this.maxGoals})`);
            if (this.goalsCompleted >= this.maxGoals) {
                this.uiText.innerText = "任務全數完成！";
                this.uiArrow.innerText = "🏆";
                this.uiDist.innerText = "";
                this.goalMesh.visible = false;
                this.targetNode = null;
            } else {
                this.startNextGoal(); 
            }
        }
    }

    updateGuidance(dist) {
        if (!this.targetNode) return;
        
        const currentGrid = this.getCurrentGrid();
        
        if (this.path.length > 0 && (currentGrid.x !== this.path[0].x || currentGrid.z !== this.path[0].z)) {
            if (this.path.length > 1) {
                const expectedNode = this.path[1];
                if (currentGrid.x !== expectedNode.x || currentGrid.z !== expectedNode.z) {
                    //console.log("⚠️ 偵測到走錯路！");
                    if (this.gameManager && this.gameManager.dataCollector) {
                        //this.gameManager.dataCollector.recordWrongTurn();
                    }
                }
            }
            this.recalculatePath();
        }

        let lookAheadNode = null;
        let turnIndex = 1; 

        if (this.path.length < 2) {
            lookAheadNode = this.path[0]; 
            turnIndex = 0;
        } else {
            lookAheadNode = this.path[1];
            turnIndex = 1;

            if (this.path.length >= 3) {
                const currentDx = this.path[1].x - this.path[0].x;
                const currentDz = this.path[1].z - this.path[0].z;
                
                for (let i = 2; i < this.path.length; i++) {
                    const nextDx = this.path[i].x - this.path[i-1].x;
                    const nextDz = this.path[i].z - this.path[i-1].z;

                    if (nextDx === currentDx && nextDz === currentDz) {
                        lookAheadNode = this.path[i]; 
                        turnIndex = i; 
                    } else {
                        break; 
                    }
                }
            }
        }

        const targetWorldX = lookAheadNode.x * this.blockSize;
        const targetWorldZ = lookAheadNode.z * this.blockSize;
        const vecToTarget = new THREE.Vector3(
            targetWorldX - this.playerCamera.position.x, 0, targetWorldZ - this.playerCamera.position.z
        );
        const distToTarget = vecToTarget.length(); 

        let immediateNode = (this.path.length >= 2) ? this.path[1] : this.path[0];
        const vecToImmediate = new THREE.Vector3(
            (immediateNode.x * this.blockSize) - this.playerCamera.position.x,
            0,
            (immediateNode.z * this.blockSize) - this.playerCamera.position.z
        );
        const distToImmediate = vecToImmediate.length();
        vecToImmediate.normalize();

        const carDir = new THREE.Vector3();
        this.playerCamera.getWorldDirection(carDir);
        carDir.y = 0; carDir.normalize();

        const currentCross = carDir.x * vecToImmediate.z - carDir.z * vecToImmediate.x;
        const currentDot = carDir.dot(vecToImmediate);

        let command = "直行";
        let arrow = "⬆️";
        let showDistance = true; 

        if (currentDot < 0.8 && distToImmediate > 25) {
            showDistance = false;
            if (currentCross > 0.1) {
                command = "前方右轉"; arrow = "➡️"; 
            } else {
                command = "前方左轉"; arrow = "⬅️";
            }
        }
        else {
            if (distToTarget > 60) { 
                arrow = "⬆️";
                command = "直行";
            }
            else {
                const isDestination = (lookAheadNode.x === this.path[this.path.length-1].x && lookAheadNode.z === this.path[this.path.length-1].z);

                if (isDestination) {
                    command = "前方抵達"; arrow = "📍";
                } else {
                    let idx = this.path.findIndex(p => p.x === lookAheadNode.x && p.z === lookAheadNode.z);
                    
                    if (idx > 0 && idx < this.path.length - 1) {
                        const nodeIn = this.path[idx];
                        const nodeOut = this.path[idx+1];
                        
                        const dirIn = new THREE.Vector3(nodeIn.x - this.path[idx-1].x, 0, nodeIn.z - this.path[idx-1].z).normalize();
                        const dirOut = new THREE.Vector3(nodeOut.x - nodeIn.x, 0, nodeOut.z - nodeIn.z).normalize();
                        
                        const crossY = dirIn.x * dirOut.z - dirIn.z * dirOut.x;

                        if (crossY > 0.1) {
                             command = "前方右轉"; arrow = "➡️"; 
                        } else if (crossY < -0.1) {
                             command = "前方左轉"; arrow = "⬅️";
                        } else {
                             command = "路口直行"; arrow = "⬆️";
                        }
                    }
                }
            }
        }

        this.uiArrow.innerText = arrow;
        this.uiText.innerText = command;
        this.currentCommand = command;

        if (showDistance) {
            this.uiDist.innerText = `${Math.floor(distToTarget)}m`;
        } else {
            this.uiDist.innerText = "";
        }
    }
    
    update() {
        const playerPos = this.playerCamera.position;
        
        this.mapCamera.position.x = playerPos.x;
        this.mapCamera.position.z = playerPos.z;
        this.mapCamera.lookAt(playerPos.x, 0, playerPos.z);

        if (this.goalMesh.visible) {
            this.goalMesh.rotation.y += 0.05;
            
            const dx = playerPos.x - this.goalMesh.position.x;
            const dz = playerPos.z - this.goalMesh.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);

            this.checkArrival(dist);
            this.updateGuidance(dist);
        }
    }

    render() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        const mapX = width - this.mapSize - 20;
        const mapY = 20;

        this.renderer.setScissorTest(true);
        this.renderer.setScissor(mapX, mapY, this.mapSize, this.mapSize);
        this.renderer.setViewport(mapX, mapY, this.mapSize, this.mapSize);

        const oldFog = this.scene.fog;
        this.scene.fog = null;

        const oldClearColor = new THREE.Color();
        this.renderer.getClearColor(oldClearColor);
        const oldClearAlpha = this.renderer.getClearAlpha();
        
        this.renderer.setClearColor(0x000000, 1);
        this.renderer.clear(); 

        this.renderer.render(this.scene, this.mapCamera);

        this.renderer.setClearColor(oldClearColor, oldClearAlpha);
        this.scene.fog = oldFog;
        this.renderer.setScissorTest(false);
    }
getNextTurnDirection() {
        // 如果還沒有指令，就預設直走
        if (!this.currentCommand) return 'STRAIGHT';
        
        // 直接判斷我們存放在變數裡的字串
        if (this.currentCommand.includes('左轉')) return 'LEFT';
        if (this.currentCommand.includes('右轉')) return 'RIGHT';
        return 'STRAIGHT';
    }
}