package app.practice.beta;

import android.Manifest;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.RandomAccessFile;

// Диктофон (src/modules/voice): список входов и выходов звука (встроенный микрофон, гарнитура, Bluetooth, USB —
// в том числе приёмники петличек), запись с выбранного входа (AudioRecord + setPreferredDevice) в WAV и
// воспроизведение на выбранный выход (AudioTrack + setPreferredDevice). Звук не покидает устройство.
@CapacitorPlugin(name = "Voice", permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "mic") })
public class VoicePlugin extends Plugin {

    private AudioManager am;
    private volatile boolean recording = false, paused = false, playing = false;
    private Thread recThread, playThread;
    private File recFile;
    private int recRate = 48000, recCh = 1;
    private long recFrames = 0;
    private AudioDeviceCallback cb;
    private boolean commSet = false, scoOn = false;

    @Override
    public void load() {
        am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        cb = new AudioDeviceCallback() {
            @Override public void onAudioDevicesAdded(AudioDeviceInfo[] d) { notifyListeners("devices", new JSObject()); }
            @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] d) { notifyListeners("devices", new JSObject()); }
        };
        am.registerAudioDeviceCallback(cb, null);
    }

    @Override
    protected void handleOnDestroy() {
        recording = false; playing = false;
        if (am != null && cb != null) am.unregisterAudioDeviceCallback(cb);
        releaseComm();
    }

    private static String typeName(int t) {
        switch (t) {
            case AudioDeviceInfo.TYPE_BUILTIN_MIC: return "builtin_mic";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return "speaker";
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE: return "earpiece";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET: return "wired_headset";
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES: return "wired_headphones";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO: return "bt_sco";
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP: return "bt_a2dp";
            case AudioDeviceInfo.TYPE_USB_DEVICE: return "usb_device";
            case AudioDeviceInfo.TYPE_USB_HEADSET: return "usb_headset";
            case AudioDeviceInfo.TYPE_USB_ACCESSORY: return "usb_accessory";
            case AudioDeviceInfo.TYPE_HDMI: return "hdmi";
            case AudioDeviceInfo.TYPE_LINE_ANALOG: return "line";
            case AudioDeviceInfo.TYPE_TELEPHONY: return "telephony";
            case AudioDeviceInfo.TYPE_REMOTE_SUBMIX: return "submix";
            case 26: return "ble_headset";   // TYPE_BLE_HEADSET (API 31)
            case 27: return "ble_speaker";   // TYPE_BLE_SPEAKER
            default: return "other_" + t;
        }
    }

    private JSObject devJson(AudioDeviceInfo d) {
        JSObject o = new JSObject();
        o.put("id", d.getId());
        o.put("type", typeName(d.getType()));
        o.put("name", String.valueOf(d.getProductName()));
        if (Build.VERSION.SDK_INT >= 28) o.put("address", d.getAddress());
        int[] ch = d.getChannelCounts();
        int max = 1; for (int c : ch) max = Math.max(max, c);
        o.put("channels", max);
        return o;
    }

    private AudioDeviceInfo find(int flags, int id) {
        for (AudioDeviceInfo d : am.getDevices(flags)) if (d.getId() == id) return d;
        return null;
    }

    @PluginMethod
    public void devices(PluginCall call) {
        JSArray ins = new JSArray(), outs = new JSArray();
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_TELEPHONY || t == AudioDeviceInfo.TYPE_REMOTE_SUBMIX || t == AudioDeviceInfo.TYPE_FM_TUNER) continue;
            ins.put(devJson(d));
        }
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_TELEPHONY || t == AudioDeviceInfo.TYPE_REMOTE_SUBMIX || t == AudioDeviceInfo.TYPE_FM || t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE) continue;
            outs.put(devJson(d));
        }
        JSObject r = new JSObject();
        r.put("inputs", ins);
        r.put("outputs", outs);
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    /* ---------- Bluetooth-гарнитура: микрофон доступен только по голосовому каналу (SCO) ---------- */

    private boolean isBtVoice(AudioDeviceInfo d) {
        return d != null && (d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || d.getType() == 26);
    }

    private void useComm(AudioDeviceInfo in) {
        try {
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= 31) {
                for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                    if (d.getType() == in.getType() && (Build.VERSION.SDK_INT < 28 || String.valueOf(d.getAddress()).equals(String.valueOf(in.getAddress())))) {
                        commSet = am.setCommunicationDevice(d);
                        break;
                    }
                }
            } else {
                am.startBluetoothSco();
                am.setBluetoothScoOn(true);
                scoOn = true;
            }
        } catch (Exception e) { /* как получится */ }
    }

    private void releaseComm() {
        try {
            if (commSet && Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice();
            if (scoOn) { am.setBluetoothScoOn(false); am.stopBluetoothSco(); }
            if (commSet || scoOn) am.setMode(AudioManager.MODE_NORMAL);
        } catch (Exception e) { /* уже отпущено */ }
        commSet = false; scoOn = false;
    }

    /* ---------- запись ---------- */

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) { requestPermissionForAlias("mic", call, "micGranted"); return; }
        doStart(call);
    }

    @PermissionCallback
    private void micGranted(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) doStart(call);
        else call.reject("denied");
    }

    private void doStart(PluginCall call) {
        if (recording) { call.reject("busy"); return; }
        int id = call.getInt("deviceId", -1);
        boolean stereo = Boolean.TRUE.equals(call.getBoolean("stereo", false));
        boolean raw = Boolean.TRUE.equals(call.getBoolean("raw", true));
        AudioDeviceInfo dev = id >= 0 ? find(AudioManager.GET_DEVICES_INPUTS, id) : null;
        boolean bt = isBtVoice(dev);
        if (bt) useComm(dev);
        recRate = bt ? 16000 : 48000;
        recCh = stereo && !bt && dev != null && dev.getChannelCounts().length > 0 && max(dev.getChannelCounts()) >= 2 ? 2 : 1;
        int chMask = recCh == 2 ? AudioFormat.CHANNEL_IN_STEREO : AudioFormat.CHANNEL_IN_MONO;
        int min = AudioRecord.getMinBufferSize(recRate, chMask, AudioFormat.ENCODING_PCM_16BIT);
        if (min <= 0) { recRate = 44100; min = AudioRecord.getMinBufferSize(recRate, chMask, AudioFormat.ENCODING_PCM_16BIT); }
        // UNPROCESSED — без системной обработки (если устройство умеет); голосовой канал — для Bluetooth
        int src = bt ? MediaRecorder.AudioSource.VOICE_COMMUNICATION : raw && Build.VERSION.SDK_INT >= 24 ? MediaRecorder.AudioSource.UNPROCESSED : MediaRecorder.AudioSource.MIC;
        AudioRecord ar;
        try {
            ar = new AudioRecord(src, recRate, chMask, AudioFormat.ENCODING_PCM_16BIT, Math.max(min * 4, recRate));
            if (ar.getState() != AudioRecord.STATE_INITIALIZED) {
                ar.release();
                ar = new AudioRecord(MediaRecorder.AudioSource.MIC, recRate, chMask, AudioFormat.ENCODING_PCM_16BIT, Math.max(min * 4, recRate));
            }
            if (dev != null) ar.setPreferredDevice(dev);
        } catch (Exception e) { releaseComm(); call.reject("unavailable"); return; }
        final AudioRecord rec = ar;
        File dir = new File(getContext().getCacheDir(), "voice");
        if (!dir.exists()) dir.mkdirs();
        recFile = new File(dir, "rec-" + System.currentTimeMillis() + ".wav");
        recFrames = 0; recording = true; paused = false;
        try { rec.startRecording(); } catch (Exception e) { recording = false; rec.release(); releaseComm(); call.reject("unavailable"); return; }
        recThread = new Thread(() -> {
            short[] buf = new short[recRate / 20 * recCh]; // 50 мс
            byte[] bytes = new byte[buf.length * 2];
            try (FileOutputStream out = new FileOutputStream(recFile)) {
                out.write(new byte[44]); // заголовок — при остановке
                while (recording) {
                    int n = rec.read(buf, 0, buf.length);
                    if (n <= 0) continue;
                    int peak = 0; double sum = 0;
                    for (int i = 0; i < n; i++) { int v = Math.abs(buf[i]); if (v > peak) peak = v; sum += (double) buf[i] * buf[i]; bytes[2 * i] = (byte) (buf[i] & 0xff); bytes[2 * i + 1] = (byte) ((buf[i] >> 8) & 0xff); }
                    if (!paused) { out.write(bytes, 0, n * 2); recFrames += n / recCh; }
                    JSObject lv = new JSObject();
                    lv.put("peak", peak / 32768.0);
                    lv.put("rms", Math.sqrt(sum / n) / 32768.0);
                    lv.put("sec", recFrames / (double) recRate);
                    lv.put("paused", paused);
                    notifyListeners("level", lv);
                }
            } catch (Exception e) { /* запись прервана */ }
            try { rec.stop(); } catch (Exception e) { /* уже */ }
            rec.release();
            releaseComm();
        });
        recThread.start();
        JSObject r = new JSObject();
        r.put("rate", recRate);
        r.put("channels", recCh);
        r.put("bt", bt);
        r.put("routed", dev == null || rec.getRoutedDevice() == null ? -1 : rec.getRoutedDevice().getId());
        call.resolve(r);
    }

    private static int max(int[] a) { int m = 0; for (int x : a) m = Math.max(m, x); return m; }

    @PluginMethod
    public void pause(PluginCall call) { paused = Boolean.TRUE.equals(call.getBoolean("on", true)); call.resolve(); }

    @PluginMethod
    public void stop(PluginCall call) {
        if (!recording) { call.reject("idle"); return; }
        recording = false;
        try { recThread.join(3000); } catch (InterruptedException e) { /* ну и ладно */ }
        try (RandomAccessFile f = new RandomAccessFile(recFile, "rw")) {
            long data = recFrames * recCh * 2;
            f.seek(0);
            f.write(header(data, recRate, recCh));
        } catch (Exception e) { call.reject("write"); return; }
        JSObject r = new JSObject();
        r.put("path", recFile.getName());
        r.put("size", recFile.length());
        r.put("sec", recFrames / (double) recRate);
        r.put("rate", recRate);
        r.put("channels", recCh);
        call.resolve(r);
    }

    private static byte[] header(long data, int rate, int ch) {
        byte[] h = new byte[44];
        put(h, 0, "RIFF"); le(h, 4, 36 + data, 4); put(h, 8, "WAVE"); put(h, 12, "fmt "); le(h, 16, 16, 4); le(h, 20, 1, 2); le(h, 22, ch, 2);
        le(h, 24, rate, 4); le(h, 28, (long) rate * ch * 2, 4); le(h, 32, ch * 2, 2); le(h, 34, 16, 2); put(h, 36, "data"); le(h, 40, data, 4);
        return h;
    }
    private static void put(byte[] b, int o, String s) { for (int i = 0; i < s.length(); i++) b[o + i] = (byte) s.charAt(i); }
    private static void le(byte[] b, int o, long v, int n) { for (int i = 0; i < n; i++) b[o + i] = (byte) ((v >> (8 * i)) & 0xff); }

    /* ---------- файлы записей (в кэше приложения): чтение и запись частями ---------- */

    private File fileOf(PluginCall call) {
        String name = call.getString("path", "").replaceAll("[\\\\/]", "_");
        return new File(new File(getContext().getCacheDir(), "voice"), name);
    }

    @PluginMethod
    public void read(PluginCall call) {
        File f = fileOf(call);
        long off = call.getLong("offset", 0L);
        int len = call.getInt("length", 1 << 20);
        try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
            long size = r.length();
            int n = (int) Math.max(0, Math.min(len, size - off));
            byte[] b = new byte[n];
            r.seek(off); r.readFully(b);
            JSObject o = new JSObject();
            o.put("data", Base64.encodeToString(b, Base64.NO_WRAP));
            o.put("size", size);
            call.resolve(o);
        } catch (Exception e) { call.reject("read"); }
    }

    @PluginMethod
    public void write(PluginCall call) {
        File dir = new File(getContext().getCacheDir(), "voice");
        if (!dir.exists()) dir.mkdirs();
        File f = fileOf(call);
        try (FileOutputStream out = new FileOutputStream(f, Boolean.TRUE.equals(call.getBoolean("append", false)))) {
            out.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) { call.reject("write"); }
    }

    @PluginMethod
    public void remove(PluginCall call) { fileOf(call).delete(); call.resolve(); }

    /* ---------- воспроизведение на выбранный выход ---------- */

    @PluginMethod
    public void play(PluginCall call) {
        stopPlayback();
        File f = fileOf(call);
        int id = call.getInt("deviceId", -1);
        double from = call.getDouble("from", 0.0);
        AudioDeviceInfo dev = id >= 0 ? find(AudioManager.GET_DEVICES_OUTPUTS, id) : null;
        int rate, ch;
        long dataOff = 44;
        try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
            byte[] h = new byte[44]; r.readFully(h);
            ch = (h[22] & 0xff) | ((h[23] & 0xff) << 8);
            rate = (h[24] & 0xff) | ((h[25] & 0xff) << 8) | ((h[26] & 0xff) << 16) | ((h[27] & 0xff) << 24);
        } catch (Exception e) { call.reject("read"); return; }
        final int fRate = rate, fCh = ch;
        int chMask = ch == 2 ? AudioFormat.CHANNEL_OUT_STEREO : AudioFormat.CHANNEL_OUT_MONO;
        boolean ear = dev != null && dev.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
        AudioAttributes attr = new AudioAttributes.Builder().setUsage(ear ? AudioAttributes.USAGE_VOICE_COMMUNICATION : AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
        int min = AudioTrack.getMinBufferSize(rate, chMask, AudioFormat.ENCODING_PCM_16BIT);
        final AudioTrack tr = new AudioTrack(attr, new AudioFormat.Builder().setSampleRate(rate).setChannelMask(chMask).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build(),
            Math.max(min * 2, rate / 5), AudioTrack.MODE_STREAM, AudioManager.AUDIO_SESSION_ID_GENERATE);
        if (dev != null) tr.setPreferredDevice(dev);
        playing = true;
        final long start = dataOff + ((long) (from * rate) * ch * 2);
        playThread = new Thread(() -> {
            try (FileInputStream in = new FileInputStream(f)) {
                in.skip(start);
                byte[] buf = new byte[fRate / 20 * fCh * 2];
                tr.play();
                long played = (start - 44) / (fCh * 2);
                int n;
                while (playing && (n = in.read(buf)) > 0) {
                    tr.write(buf, 0, n);
                    played += n / (fCh * 2);
                    JSObject p = new JSObject(); p.put("sec", played / (double) fRate); notifyListeners("pos", p);
                }
            } catch (Exception e) { /* остановлено */ }
            try { tr.stop(); } catch (Exception e) { /* уже */ }
            tr.release();
            boolean natural = playing;
            playing = false;
            JSObject e = new JSObject(); e.put("done", natural); notifyListeners("end", e);
        });
        playThread.start();
        JSObject r = new JSObject();
        r.put("routed", tr.getRoutedDevice() == null ? -1 : tr.getRoutedDevice().getId());
        call.resolve(r);
    }

    private void stopPlayback() {
        playing = false;
        if (playThread != null) { try { playThread.join(1000); } catch (InterruptedException e) { /* ну и ладно */ } playThread = null; }
    }

    @PluginMethod
    public void stopPlay(PluginCall call) { stopPlayback(); call.resolve(); }
}
