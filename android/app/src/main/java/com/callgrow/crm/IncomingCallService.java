package com.callgrow.crm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

public class IncomingCallService extends Service {
    private static final String CHANNEL_ID = "crm_call_monitor";
    private static final int NOTIF_ID = 42;
    private static final String SUPABASE_URL = "https://ymhctomdekmlrdqhcwsw.supabase.co";
    private static final String SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltaGN0b21kZWttbHJkcWhjd3N3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI5MjIyNCwiZXhwIjoyMDk0ODY4MjI0fQ.ypw4aOIMyU4bw_c3ZNdMFIsJPgQJRvx6T0NMhlLO8Vg";

    private WindowManager windowManager;
    private View overlayView;
    private Handler mainHandler;
    private TelephonyManager telephonyManager;
    private int prevCallState = TelephonyManager.CALL_STATE_IDLE;
    private boolean wasOutgoingCall = false;

    @SuppressWarnings("deprecation")
    private PhoneStateListener phoneStateListener;

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        mainHandler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
        registerPhoneListener();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, buildNotification());
        return START_STICKY;
    }

    @SuppressWarnings("deprecation")
    private void registerPhoneListener() {
        telephonyManager = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
        phoneStateListener = new PhoneStateListener() {
            @Override
            public void onCallStateChanged(int state, String phoneNumber) {
                if (state == TelephonyManager.CALL_STATE_RINGING) {
                    wasOutgoingCall = false;
                    showOverlay(phoneNumber);
                } else if (state == TelephonyManager.CALL_STATE_OFFHOOK) {
                    dismissOverlay();
                    if (prevCallState == TelephonyManager.CALL_STATE_IDLE && PhoneCallerPlugin.crmInitiatedCall) {
                        // Only bring app to front if CRM placed this call (not manual dial)
                        wasOutgoingCall = true;
                        bringAppToFront(600);
                    }
                } else if (state == TelephonyManager.CALL_STATE_IDLE) {
                    dismissOverlay();
                    if (wasOutgoingCall) {
                        // Our outgoing call ended — return to app for post-call sheet
                        bringAppToFront(300);
                    }
                    wasOutgoingCall = false;
                }
                prevCallState = state;
            }
        };
        telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
    }

    private void bringAppToFront(long delayMs) {
        mainHandler.postDelayed(() -> {
            try {
                Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                    startActivity(launch);
                }
            } catch (Exception ignored) {}
        }, delayMs);
    }

    private void showOverlay(String phone) {
        if (!Settings.canDrawOverlays(this)) return;
        mainHandler.post(() -> {
            if (overlayView != null) dismissOverlayInternal();

            overlayView = LayoutInflater.from(IncomingCallService.this)
                    .inflate(R.layout.incoming_call_overlay, null);

            TextView tvName = overlayView.findViewById(R.id.tv_name);
            TextView tvPhone = overlayView.findViewById(R.id.tv_phone);
            Button btnOpen = overlayView.findViewById(R.id.btn_open_app);
            Button btnDismiss = overlayView.findViewById(R.id.btn_dismiss);

            String displayPhone = (phone != null && !phone.isEmpty()) ? phone : "Private Number";
            tvPhone.setText(displayPhone);
            tvName.setText("Incoming Call");

            btnOpen.setOnClickListener(v -> {
                Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    startActivity(launch);
                }
                dismissOverlayInternal();
            });

            btnDismiss.setOnClickListener(v -> dismissOverlayInternal());

            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;

            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    type,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                    PixelFormat.TRANSLUCENT
            );
            params.gravity = Gravity.TOP;

            try {
                windowManager.addView(overlayView, params);
            } catch (Exception e) {
                overlayView = null;
                return;
            }

            if (phone != null && !phone.isEmpty()) {
                lookupLead(phone, tvName);
            }
        });
    }

    private void lookupLead(String phone, TextView tvName) {
        new Thread(() -> {
            try {
                String digits = phone.replaceAll("[^0-9]", "");
                String last10 = digits.length() > 10 ? digits.substring(digits.length() - 10) : digits;
                String encoded = URLEncoder.encode(last10, "UTF-8");

                String urlStr = SUPABASE_URL + "/rest/v1/leads"
                        + "?phone=ilike.*" + encoded
                        + "&select=client_name&limit=1";

                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("apikey", SUPABASE_KEY);
                conn.setRequestProperty("Authorization", "Bearer " + SUPABASE_KEY);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                int code = conn.getResponseCode();
                String name = "Not in CRM";
                if (code == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();

                    JSONArray arr = new JSONArray(sb.toString());
                    if (arr.length() > 0) {
                        name = arr.getJSONObject(0).optString("client_name", "Unknown");
                    }
                }

                String finalName = name;
                mainHandler.post(() -> {
                    if (tvName != null && overlayView != null) tvName.setText(finalName);
                });
            } catch (Exception e) {
                mainHandler.post(() -> {
                    if (tvName != null && overlayView != null) tvName.setText("Incoming Call");
                });
            }
        }).start();
    }

    private void dismissOverlay() {
        mainHandler.post(this::dismissOverlayInternal);
    }

    private void dismissOverlayInternal() {
        if (overlayView != null && windowManager != null) {
            try {
                windowManager.removeView(overlayView);
            } catch (Exception ignored) {}
            overlayView = null;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Call Monitor", NotificationManager.IMPORTANCE_MIN
            );
            ch.setDescription("Shows CRM info for incoming calls");
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (intent == null) intent = new Intent();
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Call to Grow CRM")
                .setContentText("Ready to show caller info")
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setOngoing(true)
                .build();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onDestroy() {
        if (telephonyManager != null && phoneStateListener != null) {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
        }
        dismissOverlayInternal();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
