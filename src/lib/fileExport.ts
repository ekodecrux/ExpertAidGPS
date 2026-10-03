import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';

/**
 * Universal file exporter for Web, Android, and iOS.
 * - On Mobile (Capacitor): writes directly to device storage (Documents) and prompts the native Share/Open in Files sheet.
 * - On Web: triggers a clean single-file browser download.
 */
export async function exportCsvFile(fileName: string, csvContent: string): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        // Write to Documents folder on mobile device (visible in Android Files / Files app)
        const saved = await Filesystem.writeFile({
          path: fileName,
          data: csvContent,
          directory: Directory.Documents,
          encoding: 'utf8' as any,
          recursive: true
        });

        // Launch native share / open sheet
        try {
          await Share.share({
            title: fileName,
            text: `Trip History Report: ${fileName}`,
            url: saved.uri,
            dialogTitle: 'Save / Open Trip Report'
          });
        } catch (shareErr) {
          console.warn("Share sheet dismissed or unavailable:", shareErr);
        }

        toast.success(`Saved to device Documents: ${fileName}`);
        return true;
      } catch (nativeErr: any) {
        console.warn("Directory.Documents write failed, falling back to Cache + Share:", nativeErr);
        try {
          const cacheSaved = await Filesystem.writeFile({
            path: fileName,
            data: csvContent,
            directory: Directory.Cache,
            encoding: 'utf8' as any,
            recursive: true
          });
          await Share.share({
            title: fileName,
            url: cacheSaved.uri,
            dialogTitle: 'Save Report'
          });
          toast.success(`Report ready in Files: ${fileName}`);
          return true;
        } catch (cacheErr) {
          console.error("Cache write fallback failed:", cacheErr);
        }
      }
    }

    // Web Platform browser download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast.success(`Downloaded ${fileName}`);
    return true;
  } catch (err: any) {
    console.error("Failed to export report file:", err);
    toast.error("Failed to export report file");
    return false;
  }
}
