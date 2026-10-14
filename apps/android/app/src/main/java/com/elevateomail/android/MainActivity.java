package com.elevateomail.android;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

/** Offline shell until the versioned mobile session contract and callback registration are accepted. */
public final class MainActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView status = new TextView(this);
        status.setGravity(Gravity.CENTER);
        status.setText("Elevateo Mail\nAndroid client setup pending");
        status.setTextSize(20);
        setContentView(status);
    }
}
