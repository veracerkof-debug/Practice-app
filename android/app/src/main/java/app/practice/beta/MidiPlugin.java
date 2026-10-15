package app.practice.beta;

import android.content.Context;
import android.content.pm.PackageManager;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiManager;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.Map;

// MIDI-клавиатура (USB, Bluetooth MIDI): приложение только слушает — открывает выходы устройств и передаёт
// сообщения странице событием «midi» ({ data: [байты] }); список устройств — событием «devices».
// WebView не умеет Web MIDI, поэтому — через android.media.midi. Ничего не отправляется в сеть.
@CapacitorPlugin(name = "Midi")
public class MidiPlugin extends Plugin {
    private MidiManager mm;
    private MidiManager.DeviceCallback cb;
    private final Map<Integer, Open> open = new HashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());

    private static class Open {
        MidiDevice device;
        MidiOutputPort[] ports;
        String name;
    }

    private final MidiReceiver receiver = new MidiReceiver() {
        @Override
        public void onSend(byte[] msg, int offset, int count, long timestamp) {
            JSArray a = new JSArray();
            for (int i = 0; i < count; i++) a.put(msg[offset + i] & 0xff);
            JSObject o = new JSObject();
            o.put("data", a);
            notifyListeners("midi", o);
        }
    };

    private static String nameOf(MidiDeviceInfo info) {
        Bundle p = info.getProperties();
        String n = p.getString(MidiDeviceInfo.PROPERTY_NAME);
        if (n == null) n = p.getString(MidiDeviceInfo.PROPERTY_PRODUCT);
        return n != null ? n : "MIDI";
    }

    private JSObject devices() {
        JSArray a = new JSArray();
        synchronized (open) {
            for (Open o : open.values()) a.put(o.name);
        }
        JSObject r = new JSObject();
        r.put("devices", a);
        return r;
    }

    private void openDevice(MidiDeviceInfo info) {
        if (info.getOutputPortCount() == 0) return;
        synchronized (open) {
            if (open.containsKey(info.getId())) return;
        }
        mm.openDevice(info, device -> {
            if (device == null) return;
            Open o = new Open();
            o.device = device;
            o.name = nameOf(info);
            o.ports = new MidiOutputPort[info.getOutputPortCount()];
            for (int i = 0; i < o.ports.length; i++) {
                o.ports[i] = device.openOutputPort(i);
                if (o.ports[i] != null) o.ports[i].connect(receiver);
            }
            synchronized (open) {
                open.put(info.getId(), o);
            }
            notifyListeners("devices", devices());
        }, main);
    }

    private void closeDevice(int id) {
        Open o;
        synchronized (open) {
            o = open.remove(id);
        }
        if (o == null) return;
        for (MidiOutputPort p : o.ports) {
            if (p == null) continue;
            try {
                p.disconnect(receiver);
                p.close();
            } catch (Exception ignored) {
            }
        }
        try {
            o.device.close();
        } catch (Exception ignored) {
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context c = getContext();
        if (!c.getPackageManager().hasSystemFeature(PackageManager.FEATURE_MIDI)) {
            call.reject("unsupported");
            return;
        }
        if (mm == null) mm = (MidiManager) c.getSystemService(Context.MIDI_SERVICE);
        if (mm == null) {
            call.reject("unsupported");
            return;
        }
        for (MidiDeviceInfo info : mm.getDevices()) openDevice(info);
        if (cb == null) {
            cb = new MidiManager.DeviceCallback() {
                @Override
                public void onDeviceAdded(MidiDeviceInfo info) {
                    openDevice(info);
                }

                @Override
                public void onDeviceRemoved(MidiDeviceInfo info) {
                    closeDevice(info.getId());
                    notifyListeners("devices", devices());
                }
            };
            mm.registerDeviceCallback(cb, main);
        }
        call.resolve(devices());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (mm != null && cb != null) mm.unregisterDeviceCallback(cb);
        cb = null;
        Integer[] ids;
        synchronized (open) {
            ids = open.keySet().toArray(new Integer[0]);
        }
        for (Integer id : ids) closeDevice(id);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (mm != null && cb != null) mm.unregisterDeviceCallback(cb);
        cb = null;
        Integer[] ids;
        synchronized (open) {
            ids = open.keySet().toArray(new Integer[0]);
        }
        for (Integer id : ids) closeDevice(id);
    }
}
