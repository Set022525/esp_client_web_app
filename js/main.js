// ======== ここを自分のESP32の設定に合わせて書き換え ==========
const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
const CHARACTERISTIC_UUID = "12345678-1234-5678-1234-56789abcdef1";
const DEVICE_NAME_PREFIX = "ESP32-L6471"; // ESP32側のデバイス名と合わせる
// ==============================================================

let bleDevice = null;
let bleServer = null;
let cmdCharacteristic = null;

const connectBtn = document.getElementById("connectBtn");
const statusEl = document.getElementById("status");
const controlSection = document.getElementById("control");
const valueSlider = document.getElementById("valueSlider");
const valueLabel = document.getElementById("valueLabel");
const sendBtn = document.getElementById("sendBtn");
const logEl = document.getElementById("log");

function log(msg) {
  console.log(msg);
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
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

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: DEVICE_NAME_PREFIX }],
      optionalServices: [SERVICE_UUID],
    });

    bleDevice = device;
    bleDevice.addEventListener("gattserverdisconnected", onDisconnected);

    log(`デバイス選択: ${device.name}`);
    setStatus(`接続中...`);

    bleServer = await device.gatt.connect();
    log("GATT 接続完了");

    const service = await bleServer.getPrimaryService(SERVICE_UUID);
    log("サービス取得");

    cmdCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
    log("キャラクタリスティック取得");

    setStatus(`接続中: ${device.name}`);
    controlSection.classList.remove("hidden");
  } catch (error) {
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
}

sendBtn.addEventListener("click", async () => {
  if (!cmdCharacteristic) {
    alert("まだ接続されていません。");
    return;
  }

  const value = parseInt(valueSlider.value, 10);
  log(`送信値: ${value}`);

  try {
    // ここでは「0〜100の整数値を1バイトで送る」例
    // ESP32側も同じフォーマットで読み取る必要があります。
    const data = new Uint8Array([value]);
    await cmdCharacteristic.writeValue(data);
    log("送信完了");
  } catch (error) {
    console.error(error);
    log("送信エラー: " + error);
  }
});
