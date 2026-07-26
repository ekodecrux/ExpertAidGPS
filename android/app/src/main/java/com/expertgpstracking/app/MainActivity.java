package com.expertgpstracking.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final int PERMISSION_REQUEST_CODE = 100;

  @Override
  protected void onStart() {
    super.onStart();
    requestLocationPermissions();
  }

  private void requestLocationPermissions() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      // Check if permission is not granted
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
          != PackageManager.PERMISSION_GRANTED
          || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
          != PackageManager.PERMISSION_GRANTED) {
        // Request permissions
        ActivityCompat.requestPermissions(
            this,
            new String[]{
              Manifest.permission.ACCESS_FINE_LOCATION,
              Manifest.permission.ACCESS_COARSE_LOCATION
            },
            PERMISSION_REQUEST_CODE);
      }
    }
  }

  @Override
  public void onRequestPermissionsResult(
      int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);

    if (requestCode == PERMISSION_REQUEST_CODE) {
      boolean fineLocationGranted = false;
      boolean coarseLocationGranted = false;

      for (int i = 0; i < permissions.length; i++) {
        if (permissions[i].equals(Manifest.permission.ACCESS_FINE_LOCATION)) {
          fineLocationGranted = grantResults[i] == PackageManager.PERMISSION_GRANTED;
        } else if (permissions[i].equals(Manifest.permission.ACCESS_COARSE_LOCATION)) {
          coarseLocationGranted = grantResults[i] == PackageManager.PERMISSION_GRANTED;
        }
      }

      if (fineLocationGranted || coarseLocationGranted) {
        android.util.Log.d("MainActivity", "Location permissions granted");
      } else {
        android.util.Log.d("MainActivity", "Location permissions denied");
      }
    }
  }
}
