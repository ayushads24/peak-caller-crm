package com.callgrow.crm;

import android.Manifest;
import android.database.Cursor;
import android.provider.CallLog;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "CallLog",
    permissions = {
        @Permission(alias = "readCallLog", strings = { Manifest.permission.READ_CALL_LOG })
    }
)
public class CallLogPlugin extends Plugin {

    @PluginMethod
    public void getRecentCall(PluginCall call) {
        if (getPermissionState("readCallLog") != PermissionState.GRANTED) {
            requestPermissionForAlias("readCallLog", call, "callLogPermCallback");
            return;
        }
        doQuery(call);
    }

    @PermissionCallback
    private void callLogPermCallback(PluginCall call) {
        if (getPermissionState("readCallLog") == PermissionState.GRANTED) {
            doQuery(call);
        } else {
            call.reject("READ_CALL_LOG permission denied");
        }
    }

    private void doQuery(PluginCall call) {
        String phone = call.getString("phone", "");
        Double afterDouble = call.getDouble("afterTimestamp", 0.0);
        long after = afterDouble.longValue();

        try {
            Cursor c = getContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                new String[]{ CallLog.Calls.NUMBER, CallLog.Calls.DURATION, CallLog.Calls.TYPE, CallLog.Calls.DATE },
                CallLog.Calls.DATE + " >= ?",
                new String[]{ String.valueOf(after) },
                CallLog.Calls.DATE + " DESC"
            );

            if (c != null) {
                while (c.moveToNext()) {
                    String num = c.getString(0);
                    if (phoneMatches(num, phone)) {
                        long duration = c.getLong(1);
                        int type = c.getInt(2);
                        long date = c.getLong(3);
                        c.close();

                        JSObject res = new JSObject();
                        res.put("found", true);
                        res.put("duration", duration);
                        res.put("type", type);
                        res.put("connected", duration > 0);
                        res.put("date", date);
                        call.resolve(res);
                        return;
                    }
                }
                c.close();
            }
        } catch (Exception e) {
            call.reject(e.getMessage());
            return;
        }

        JSObject res = new JSObject();
        res.put("found", false);
        call.resolve(res);
    }

    private boolean phoneMatches(String a, String b) {
        if (a == null || b == null) return false;
        String na = a.replaceAll("[^0-9]", "");
        String nb = b.replaceAll("[^0-9]", "");
        if (na.equals(nb)) return true;
        if (na.length() > nb.length()) return na.endsWith(nb);
        return nb.endsWith(na);
    }
}
