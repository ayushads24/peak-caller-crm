package com.callgrow.crm;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.CallLog;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "PhoneCaller",
    permissions = {
        @Permission(strings = { Manifest.permission.CALL_PHONE, Manifest.permission.READ_CALL_LOG }, alias = "callPhone")
    }
)
public class PhoneCallerPlugin extends Plugin {

    private TelephonyManager telephonyManager;
    private PhoneStateListener callStateListener;
    private boolean trackingCall = false;
    private String trackedPhone = null;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void call(PluginCall pluginCall) {
        String phone = pluginCall.getString("phone");
        if (phone == null || phone.isEmpty()) {
            pluginCall.reject("phone number required");
            return;
        }

        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("callPhone", pluginCall, "callPhonePermsCallback");
            return;
        }

        placeCall(pluginCall, phone);
    }

    @PermissionCallback
    private void callPhonePermsCallback(PluginCall pluginCall) {
        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE)
                == PackageManager.PERMISSION_GRANTED) {
            String phone = pluginCall.getString("phone");
            placeCall(pluginCall, phone);
        } else {
            String phone = pluginCall.getString("phone");
            openDialer(phone);
            pluginCall.resolve(new JSObject().put("method", "dialer"));
        }
    }

    private void placeCall(PluginCall pluginCall, String phone) {
        try {
            Intent intent = new Intent(Intent.ACTION_CALL);
            intent.setData(Uri.parse("tel:" + phone));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            trackedPhone = phone;
            startCallMonitoring();
            pluginCall.resolve(new JSObject().put("method", "direct"));
        } catch (SecurityException e) {
            openDialer(phone);
            pluginCall.resolve(new JSObject().put("method", "dialer"));
        } catch (Exception e) {
            openDialer(phone);
            pluginCall.resolve(new JSObject().put("method", "dialer"));
        }
    }

    private void startCallMonitoring() {
        if (telephonyManager == null) {
            telephonyManager = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
        }
        stopCallMonitoring();
        trackingCall = false;

        callStateListener = new PhoneStateListener() {
            @Override
            public void onCallStateChanged(int state, String phoneNumber) {
                if (state == TelephonyManager.CALL_STATE_OFFHOOK) {
                    trackingCall = true;
                } else if (state == TelephonyManager.CALL_STATE_IDLE && trackingCall) {
                    trackingCall = false;
                    stopCallMonitoring();
                    // Delay so Android writes the call to CallLog before we read it
                    mainHandler.postDelayed(() -> checkAndFireCallResult(trackedPhone), 1500);
                }
            }
        };
        telephonyManager.listen(callStateListener, PhoneStateListener.LISTEN_CALL_STATE);
    }

    private void stopCallMonitoring() {
        if (telephonyManager != null && callStateListener != null) {
            telephonyManager.listen(callStateListener, PhoneStateListener.LISTEN_NONE);
            callStateListener = null;
        }
    }

    private void checkAndFireCallResult(String phone) {
        int duration = 0;
        try {
            Cursor cursor = getContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                new String[]{ CallLog.Calls.DURATION },
                CallLog.Calls.TYPE + " = ?",
                new String[]{ String.valueOf(CallLog.Calls.OUTGOING_TYPE) },
                CallLog.Calls.DATE + " DESC"
            );
            if (cursor != null) {
                if (cursor.moveToFirst()) {
                    duration = cursor.getInt(0);
                }
                cursor.close();
            }
        } catch (Exception ignored) {}

        JSObject event = new JSObject();
        event.put("answered", duration > 0);
        event.put("duration", duration);
        event.put("phone", phone != null ? phone : "");
        notifyListeners("callEnded", event, true);
    }

    private void openDialer(String phone) {
        Intent intent = new Intent(Intent.ACTION_DIAL);
        intent.setData(Uri.parse("tel:" + phone));
        getActivity().startActivity(intent);
    }
}
