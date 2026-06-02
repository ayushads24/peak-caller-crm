package com.callgrow.crm;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
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
        @Permission(strings = { Manifest.permission.CALL_PHONE }, alias = "callPhone")
    }
)
public class PhoneCallerPlugin extends Plugin {

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
            // Permission denied - fall back to dialer
            String phone = pluginCall.getString("phone");
            openDialer(phone);
            pluginCall.resolve(new JSObject().put("method", "dialer"));
        }
    }

    private void placeCall(PluginCall pluginCall, String phone) {
        try {
            Intent intent = new Intent(Intent.ACTION_CALL);
            intent.setData(Uri.parse("tel:" + phone));
            getActivity().startActivity(intent);
            pluginCall.resolve(new JSObject().put("method", "direct"));
        } catch (SecurityException e) {
            openDialer(phone);
            pluginCall.resolve(new JSObject().put("method", "dialer"));
        } catch (Exception e) {
            openDialer(phone);
            pluginCall.resolve(new JSObject().put("method", "dialer"));
        }
    }

    private void openDialer(String phone) {
        Intent intent = new Intent(Intent.ACTION_DIAL);
        intent.setData(Uri.parse("tel:" + phone));
        getActivity().startActivity(intent);
    }
}
