// ======== ここを自分のESP32の設定に合わせて書き換え ==========
const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
const CHARACTERISTIC_UUID = "12345678-1234-5678-1234-56789abcdef1";
const POSITION_CHARACTERISTIC_UUID = "12345678-1234-5678-1234-56789abcdef2";
const DEVICE_NAME_PREFIX = "ESP32-L6471"; // ESP32側のデバイス名と合わせる
const MICROSTEPS_PER_REV = 1600; // 200step/rev * 1/8 microstep
// ==============================================================

let bleDevice = null;
let bleServer = null;
let cmdCharacteristic = null;
let posCharacteristic = null;

const connectBtn = document.getElementById("connectBtn");
const statusEl = document.getElementById("status");
const controlSection = document.getElementById("control");
const valueSlider = document.getElementById("valueSlider");
const valueLabel = document.getElementById("valueLabel");
const btnUp = document.getElementById("btnUp");
const btnDown = document.getElementById("btnDown");
const stepCountEl = document.getElementById("stepCount");
const revCountEl = document.getElementById("revCount");
const logEl = document.getElementById("log");

function log(msg) {
  console.log(msg);
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function isConnected() {
  return cmdCharacteristic && bleDevice && bleDevice.gatt.connected;
}

async function sendValue(rawValue) {
  if (!cmdCharacteristic) {
    alert("まだ接続されていません。");
    return;
  }
  const value = Math.max(0, Math.min(255, rawValue));
  try {
    await cmdCharacteristic.writeValue(new Uint8Array([value]));
    log(`送信値: ${value}`);
  } catch (error) {
    console.error(error);
    log("送信エラー: " + error);
  }
}

function encodeCommand(direction) {
  const speed = parseInt(valueSlider.value, 10);
  // 0は停止。1-100 正転、0x80 | speed で逆転を表現。
  if (speed === 0) return 0;
  return direction === "ccw" ? (0x80 | speed) : speed;
}

valueSlider.addEventListener("input", () => {
  valueLabel.textContent = valueSlider.value;
});

connectBtn.addEventListener("click", async () => {
  try {
    if (!navigator.bluetooth) {
      alert("このブラウザは Web Bluetooth に対応していません。Chrome を使用してください。");
      return;
    }

    log("デバイス検索中...");
    setStatus("検索中...");

    // 名前が違う場合でもサービス UUID で拾えるようにフィルタを複数指定
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: DEVICE_NAME_PREFIX },
        { services: [SERVICE_UUID] },
      ],
      optionalServices: [SERVICE_UUID],
    });

    // 既存の接続が残っている場合は切断
    if (bleDevice && bleDevice.gatt.connected) {
      try {
        bleDevice.gatt.disconnect();
      } catch (_) {
        /* ignore */
      }
    }

    bleDevice = device;
    bleDevice.addEventListener("gattserverdisconnected", onDisconnected);

    const deviceLabel = device.name || "不明なデバイス";
    log(`デバイス選択: ${deviceLabel}`);
    setStatus(`接続中...`);

    const connectAndGetService = async (attempt = 1, maxAttempt = 3) => {
      const start = performance.now();
      const ensureConnected = async () => {
        if (device.gatt.connected) return device.gatt;
        return await device.gatt.connect();
      };

      bleServer = await ensureConnected();
      log(`GATT 接続完了 (try ${attempt}, ${(performance.now() - start).toFixed(0)}ms)`);

      try {
        const s = await bleServer.getPrimaryService(SERVICE_UUID);
        return s;
      } catch (error) {
        if (error.name === "NetworkError" && attempt < maxAttempt) {
          log(`切断を検知 (try ${attempt}) -> 再接続を試行します...`);
          await new Promise((r) => setTimeout(r, 150));
          return await connectAndGetService(attempt + 1, maxAttempt);
        }
        throw error;
      }
    };

    const service = await connectAndGetService();
    log("サービス取得");

    cmdCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
    log("キャラクタリスティック取得");
    posCharacteristic = await service.getCharacteristic(POSITION_CHARACTERISTIC_UUID);
    log("位置キャラクタリスティック取得");

    await subscribePosition();

    setStatus(`接続中: ${device.name}`);
    controlSection.classList.remove("hidden");
  } catch (error) {
    // NotFoundError はユーザーがデバイス選択をキャンセルした場合にも発生する
    if (error && error.name === "NotFoundError") {
      log("接続キャンセル: デバイスが選択されませんでした。");
      setStatus("キャンセルされました");
      return;
    }

    console.error(error);
    log("接続エラー: " + error);
    setStatus("接続エラー");
  }
});

function onDisconnected(event) {
  const device = event.target;
  log(`切断: ${device.name}`);
  setStatus("切断済み");
  controlSection.classList.add("hidden");
  posCharacteristic = null;
}

function attachHoldButton(btn, direction) {
  let holding = false;

  const start = async () => {
    if (!isConnected()) return;
    holding = true;
    await sendValue(encodeCommand(direction));
  };

  const stop = async () => {
    if (!holding || !isConnected()) return;
    holding = false;
    await sendValue(0); // ソフトストップ
  };

  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    start();
  });
  btn.addEventListener("pointerup", stop);
  // btn.addEventListener("pointerleave", stop);
  btn.addEventListener("pointercancel", stop);
}

attachHoldButton(btnUp, "cw");
attachHoldButton(btnDown, "ccw");

async function subscribePosition() {
  if (!posCharacteristic) return;
  posCharacteristic.addEventListener("characteristicvaluechanged", (event) => {
    const dv = event.target.value;
    if (!dv || dv.byteLength < 4) return;
    const steps = dv.getInt32(0, true); // little-endian
    stepCountEl.textContent = steps.toString();
    const rev = steps / MICROSTEPS_PER_REV;
    revCountEl.textContent = rev.toFixed(3);
  });
  await posCharacteristic.startNotifications();
  // 初期値を一度読んで表示
  const v = await posCharacteristic.readValue();
  const steps = v.getInt32(0, true);
  stepCountEl.textContent = steps.toString();
  revCountEl.textContent = (steps / MICROSTEPS_PER_REV).toFixed(3);
}
