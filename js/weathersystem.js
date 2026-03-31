// js/WeatherSystem.js
export class WeatherSystem {
    constructor(scene, directionalLight, ambientLight) {
        this.scene = scene;
        this.dirLight = directionalLight;
        this.ambLight = ambientLight;
        
        this.rainSystem = null;
        this.isRaining = false;
        this.rainCount = 15000; // 雨滴總數
        
        // 定義四種情境 (配置不變)
        this.scenarios = [
            { name: "晴朗早晨", type: 'day', rain: false, fogDen: 0.002, sky: 0x87CEEB, light: 1.5 },
            { name: "迷霧清晨", type: 'day', rain: false, fogDen: 0.005, sky: 0xCCCCCC, light: 1.2 },
            { name: "深夜",     type: 'night', rain: false, fogDen: 0.005, sky: 0x050510, light: 0.8 }, 
            { name: "暴雨夜",   type: 'night', rain: true,  fogDen: 0.01, sky: 0x010105, light: 0.6 }
        ];
    }

    initRandomWeather() {
        // (這部分不用動，維持原樣)
        const idx = Math.floor(Math.random() * this.scenarios.length);
        const config = this.scenarios[idx];
        console.log(`🌤️ 天氣載入: ${config.name}`);
        this.applyWeather(config);
        return config.type;
    }

    applyWeather(config) {
        // (這部分不用動，維持原樣)
        const skyColor = new THREE.Color(config.sky);
        this.scene.background = skyColor;
        this.scene.fog = new THREE.FogExp2(config.sky, config.fogDen);
        if (this.dirLight) this.dirLight.intensity = config.light;
        if (this.ambLight) this.ambLight.intensity = config.light * 0.7; 

        // 如果之前有下雨系統，先移除掉，避免重複疊加
        if (this.rainSystem) {
            this.scene.remove(this.rainSystem);
            this.rainSystem.geometry.dispose();
            this.rainSystem.material.dispose();
            this.rainSystem = null;
        }

        if (config.rain) {
            this.createRain();
        } else {
            this.isRaining = false;
        }
    }

    // ★★★ 重點修改 1：建立更自然的雨滴資料 ★★★
    createRain() {
        this.isRaining = true;
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const velocities = []; // 新增：用來存每一滴雨的速度

        // 設定雨水分布範圍 (根據你的城市大小調整)
        const rangeX = 800;
        const rangeZ = 800;
        const rangeY = 250;

        for (let i = 0; i < this.rainCount; i++) {
            // 隨機位置
            positions.push((Math.random() - 0.5) * rangeX); // X
            positions.push(Math.random() * rangeY);         // Y (高度)
            positions.push((Math.random() - 0.5) * rangeZ); // Z

            // ★ 隨機速度：讓每滴雨的速度在 120 到 220 之間變化
            // 這樣雨看起來才會有層次感，不會像一片牆壁一起掉下來
            velocities.push(Math.random() * 100 + 120); 
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        // 將速度屬性綁定到幾何體上，方便 update 時取用
        geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 1));

        // ★★★ 重點修改 2：更自然的材質設定 ★★★
        const material = new THREE.PointsMaterial({
            color: 0xaaddff, // 稍微帶點藍色，比較像水
            size: 0.7,       // 調整大小
            transparent: true,
            opacity: 0.6,    // 透明度高一點，比較柔和
            depthWrite: false, // 關鍵！不寫入深度緩衝，避免雨滴互相遮擋產生怪異黑邊
            blending: THREE.AdditiveBlending // 疊加混合，讓雨滴看起來有水光發亮的感覺
        });

        this.rainSystem = new THREE.Points(geometry, material);
        // 確保雨滴受霧氣影響，遠處會淡出
        this.rainSystem.fog = true; 
        this.scene.add(this.rainSystem);
    }

    // ★★★ 重點修改 3：加入風力和速度差異的更新邏輯 ★★★
    update(dt) {
        if (!this.isRaining || !this.rainSystem) return;

        const timeDelta = dt || 0.016;
        
        // 取得位置和速度陣列
        const positions = this.rainSystem.geometry.attributes.position.array;
        const velocities = this.rainSystem.geometry.attributes.velocity.array;

        // ★ 定義風力 (可以自己調整 xy 的數值改變風向)
        // 這裡設定微風向 X 軸和 Z 軸吹
        const windX = 15 * timeDelta; 
        const windZ = 8 * timeDelta;

        // 使用計數迴圈，比較容易同時操作 position 和 velocity
        for (let i = 0; i < this.rainCount; i++) {
            const index3 = i * 3;      // X 位置的索引
            const indexY = index3 + 1; // Y 位置的索引
            const indexZ = index3 + 2; // Z 位置的索引

            // 1. Y 軸下降 (使用該雨滴獨有的速度)
            positions[indexY] -= velocities[i] * timeDelta;

            // 2. 加入風力漂移 (X 和 Z 軸移動)
            positions[index3] += windX;
            positions[indexZ] += windZ;

            // 3. 重置機制
            // 如果掉到地面以下
            if (positions[indexY] < 0) {
                positions[indexY] = 250; // 回到天空
                
                // ★「無縫循環」技巧：
                // 因為有風在吹，雨滴會一直往旁邊飄走。
                // 如果飄出邊界，把它移到對面，讓它看起來是源源不絕的。
                if (positions[index3] > 400) positions[index3] -= 800;
                if (positions[indexZ] > 400) positions[indexZ] -= 800;
            }
        }
        
        // 告訴 GPU 位置已更新
        this.rainSystem.geometry.attributes.position.needsUpdate = true;
    }
}