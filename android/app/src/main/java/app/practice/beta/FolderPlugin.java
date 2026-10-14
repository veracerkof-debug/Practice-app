package app.practice.beta;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;

// Папка Melete (src/core/folder.js): человек сам выбирает папку (системный выбор, например «Документы/Melete»),
// приложение получает к ней постоянный доступ и раскладывает там данные: Data (копия данных), Media, Tabs, PDF, Lyrics.
// Файлы, положенные в папку из файлового менеджера, приложение подхватывает. Пути — относительные, через «/».
// Большие файлы читаются и пишутся частями (base64), без лишних разрешений на всё хранилище.
@CapacitorPlugin(name = "Folder")
public class FolderPlugin extends Plugin {

    private static final String PREFS = "melete_folder", KEY = "tree";
    private static final String[] COLS = {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED,
    };

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private ContentResolver cr() { return getContext().getContentResolver(); }

    private Uri tree() {
        String s = prefs().getString(KEY, null);
        if (s == null) return null;
        Uri u = Uri.parse(s);
        for (UriPermission p : cr().getPersistedUriPermissions()) {
            if (p.getUri().equals(u) && p.isReadPermission() && p.isWritePermission()) return u;
        }
        return null;
    }

    private String nameOf(Uri treeUri) {
        try (Cursor c = cr().query(DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri)), COLS, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(1);
        } catch (Exception e) { /* без имени */ }
        return "";
    }

    @PluginMethod
    public void status(PluginCall call) {
        Uri t = tree();
        JSObject r = new JSObject();
        r.put("ok", t != null);
        if (t != null) r.put("name", nameOf(t));
        call.resolve(r);
    }

    @PluginMethod
    public void pick(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        // начать с «Документов»
        if (Build.VERSION.SDK_INT >= 26) {
            try { i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse("content://com.android.externalstorage.documents/document/primary%3ADocuments")); }
            catch (Exception e) { /* как есть */ }
        }
        startActivityForResult(call, i, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult res) {
        if (call == null) return;
        if (res.getResultCode() != Activity.RESULT_OK || res.getData() == null || res.getData().getData() == null) { call.reject("cancel"); return; }
        Uri u = res.getData().getData();
        try {
            cr().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception e) { call.reject("permission"); return; }
        // прежняя папка больше не нужна
        String old = prefs().getString(KEY, null);
        if (old != null && !old.equals(u.toString())) {
            try { cr().releasePersistableUriPermission(Uri.parse(old), Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception e) { /* уже нет */ }
        }
        prefs().edit().putString(KEY, u.toString()).apply();
        JSObject r = new JSObject();
        r.put("ok", true);
        r.put("name", nameOf(u));
        call.resolve(r);
    }

    @PluginMethod
    public void forget(PluginCall call) {
        String old = prefs().getString(KEY, null);
        if (old != null) {
            try { cr().releasePersistableUriPermission(Uri.parse(old), Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception e) { /* уже нет */ }
        }
        prefs().edit().remove(KEY).apply();
        call.resolve();
    }

    /* ---------- пути внутри папки ---------- */

    // [docId, mime, size, mtime] дочернего элемента с именем name или null
    private String[] child(Uri t, String parentId, String name) {
        try (Cursor c = cr().query(DocumentsContract.buildChildDocumentsUriUsingTree(t, parentId), COLS, null, null, null)) {
            if (c == null) return null;
            while (c.moveToNext()) {
                if (name.equals(c.getString(1))) return new String[] { c.getString(0), c.getString(2), String.valueOf(c.getLong(3)), String.valueOf(c.getLong(4)) };
            }
        }
        return null;
    }

    // docId по пути; create — создать недостающие папки (и файл, если fileMime != null)
    private String resolve(Uri t, String path, boolean create, String fileMime) throws Exception {
        String id = DocumentsContract.getTreeDocumentId(t);
        if (path == null || path.isEmpty()) return id;
        String[] parts = path.split("/");
        for (int k = 0; k < parts.length; k++) {
            String p = parts[k];
            if (p.isEmpty()) continue;
            boolean last = k == parts.length - 1;
            String[] c = child(t, id, p);
            if (c == null) {
                if (!create) return null;
                String mime = last && fileMime != null ? fileMime : DocumentsContract.Document.MIME_TYPE_DIR;
                Uri made = DocumentsContract.createDocument(cr(), DocumentsContract.buildDocumentUriUsingTree(t, id), mime, p);
                if (made == null) throw new Exception("create");
                id = DocumentsContract.getDocumentId(made);
            } else id = c[0];
        }
        return id;
    }

    private Uri docUri(Uri t, String id) { return DocumentsContract.buildDocumentUriUsingTree(t, id); }

    @PluginMethod
    public void list(PluginCall call) {
        Uri t = tree();
        if (t == null) { call.reject("nofolder"); return; }
        try {
            String id = resolve(t, call.getString("dir", ""), false, null);
            JSArray arr = new JSArray();
            if (id != null) {
                try (Cursor c = cr().query(DocumentsContract.buildChildDocumentsUriUsingTree(t, id), COLS, null, null, null)) {
                    while (c != null && c.moveToNext()) {
                        JSObject o = new JSObject();
                        o.put("name", c.getString(1));
                        o.put("dir", DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2)));
                        o.put("size", c.getLong(3));
                        o.put("mtime", c.getLong(4));
                        o.put("type", c.getString(2));
                        arr.put(o);
                    }
                }
            }
            JSObject r = new JSObject();
            r.put("items", arr);
            call.resolve(r);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void mkdirs(PluginCall call) {
        Uri t = tree();
        if (t == null) { call.reject("nofolder"); return; }
        try { resolve(t, call.getString("dir", ""), true, null); call.resolve(); }
        catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    // Часть файла: { path, offset, length } → { data (base64), size }
    @PluginMethod
    public void read(PluginCall call) {
        Uri t = tree();
        if (t == null) { call.reject("nofolder"); return; }
        try {
            String id = resolve(t, call.getString("path", ""), false, null);
            if (id == null) { call.reject("nofile"); return; }
            long off = call.getLong("offset", 0L);
            int len = call.getInt("length", 1 << 20);
            try (ParcelFileDescriptor pfd = cr().openFileDescriptor(docUri(t, id), "r");
                 FileInputStream in = new FileInputStream(pfd.getFileDescriptor())) {
                FileChannel ch = in.getChannel();
                long size = ch.size();
                ch.position(Math.min(off, size));
                ByteBuffer buf = ByteBuffer.allocate((int) Math.max(0, Math.min(len, size - Math.min(off, size))));
                while (buf.hasRemaining() && ch.read(buf) > 0) { /* читаем до конца куска */ }
                JSObject r = new JSObject();
                r.put("data", Base64.encodeToString(buf.array(), 0, buf.position(), Base64.NO_WRAP));
                r.put("size", size);
                call.resolve(r);
            }
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    // Записать часть файла: { path, data (base64), append, mime }; append=false — файл с начала
    @PluginMethod
    public void write(PluginCall call) {
        Uri t = tree();
        if (t == null) { call.reject("nofolder"); return; }
        try {
            String path = call.getString("path", "");
            String id = resolve(t, path, true, call.getString("mime", "application/octet-stream"));
            boolean append = Boolean.TRUE.equals(call.getBoolean("append", false));
            byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
            try (ParcelFileDescriptor pfd = cr().openFileDescriptor(docUri(t, id), append ? "wa" : "wt");
                 FileOutputStream out = new FileOutputStream(pfd.getFileDescriptor())) {
                out.write(bytes);
            }
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        Uri t = tree();
        if (t == null) { call.reject("nofolder"); return; }
        try {
            String id = resolve(t, call.getString("path", ""), false, null);
            if (id != null) DocumentsContract.deleteDocument(cr(), docUri(t, id));
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
}
