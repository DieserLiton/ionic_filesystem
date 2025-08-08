<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start" v-if="canGoUp">
          <ion-button @click="goUp" aria-label="Nach oben">
            <ion-icon :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>Dateimanager</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="refresh" aria-label="Aktualisieren">
            <ion-icon :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-chip class="path-chip" v-for="(seg, i) in displayPath" :key="i">
          <ion-label>{{ seg || 'Root' }}</ion-label>
        </ion-chip>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="with-gap">
      <ion-list inset>
        <ion-item v-if="entries.length === 0">
          <ion-label>Keine Dateien/Ordner im aktuellen Verzeichnis.</ion-label>
        </ion-item>

        <ion-item
            v-for="entry in entries"
            :key="entry.fullPath"
            button
            detail
            @click="entry.isDirectory ? enterFolder(entry) : openFile(entry)"
        >
          <ion-avatar slot="start">
            <ion-icon class="file-icon" :icon="entry.isDirectory ? folderOutline : documentOutline" />
          </ion-avatar>
          <ion-label>
            <h2>{{ entry.name }}</h2>
            <p class="entry-subtle">
              <span v-if="entry.isDirectory">Ordner</span>
              <span v-else> Datei</span>
              <span v-if="!entry.isDirectory && entry.size !== undefined"> • {{ formatSize(entry.size) }}</span>
            </p>
          </ion-label>
          <ion-buttons slot="end">
            <ion-button fill="clear" @click.stop="openActions(entry)">
              <ion-icon :icon="ellipsisVertical" />
            </ion-button>
          </ion-buttons>
        </ion-item>
      </ion-list>

      <ion-action-sheet
          :is-open="actionEntry !== null"
          header="Aktionen"
          :buttons="actionButtons"
          @didDismiss="actionEntry = null"
      />

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="openAddSheet" aria-label="Hinzufügen">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>

      <ion-action-sheet
          :is-open="isAddOpen"
          header="Hinzufügen"
          :buttons="addButtons"
          @didDismiss="isAddOpen = false"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel,
  IonButtons, IonButton, IonIcon, IonFab, IonFabButton, IonActionSheet, IonAvatar, IonChip
} from '@ionic/vue';
import { ref, computed, onMounted } from 'vue';
import {
  addOutline,
  chevronBackOutline,
  documentOutline,
  ellipsisVertical,
  folderOutline,
  refreshOutline,
  trashOutline,
  openOutline
} from 'ionicons/icons';

import { Filesystem, Directory } from '@capacitor/filesystem';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Share } from '@capacitor/share';

type FsEntry = {
  name: string;
  fullPath: string;      // relativ zum Root (Directory.Data)
  isDirectory: boolean;
  size?: number;
  mtime?: number;
  uri?: string;
  mimeType?: string;
};

const ROOT_DIR = Directory.Data; // App-intern
const pathStack = ref<string[]>([]);

const entries = ref<FsEntry[]>([]);
const actionEntry = ref<FsEntry | null>(null);
const isAddOpen = ref(false);

const canGoUp = computed(() => pathStack.value.length > 0);
const displayPath = computed(() => ['/', ...pathStack.value]);

function joinPath(...parts: string[]) {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}
function currentPath(): string {
  return joinPath(...pathStack.value);
}
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

function guessMime(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    // Text / Code
    'txt':'text/plain','md':'text/markdown','rtf':'application/rtf','csv':'text/csv','tsv':'text/tab-separated-values',
    'json':'application/json','yaml':'application/x-yaml','yml':'application/x-yaml','xml':'application/xml',
    'html':'text/html','htm':'text/html','css':'text/css','js':'text/javascript','ts':'text/plain',
    'py':'text/x-python','java':'text/x-java-source','c':'text/x-c','cpp':'text/x-c++src','cs':'text/plain',
    // Images
    'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','gif':'image/gif','webp':'image/webp','bmp':'image/bmp',
    'heic':'image/heic','svg':'image/svg+xml','tif':'image/tiff','tiff':'image/tiff',
    // PDF
    'pdf':'application/pdf',
    // Office OpenXML
    'docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Legacy Office
    'doc':'application/msword','xls':'application/vnd.ms-excel','ppt':'application/vnd.ms-powerpoint',
    // OpenDocument
    'odt':'application/vnd.oasis.opendocument.text',
    'ods':'application/vnd.oasis.opendocument.spreadsheet',
    'odp':'application/vnd.oasis.opendocument.presentation',
    // Audio
    'mp3':'audio/mpeg','wav':'audio/wav','m4a':'audio/mp4','ogg':'audio/ogg','flac':'audio/flac',
    // Video
    'mp4':'video/mp4','m4v':'video/x-m4v','mov':'video/quicktime','avi':'video/x-msvideo','mkv':'video/x-matroska','webm':'video/webm',
    // Archives
    'zip':'application/zip','rar':'application/vnd.rar','7z':'application/x-7z-compressed','tar':'application/x-tar','gz':'application/gzip',
    // Misc
    'apk':'application/vnd.android.package-archive','pdfa':'application/pdf'
  };
  return map[ext] || 'application/octet-stream';
}

async function refresh() {
  try {
    const res = await Filesystem.readdir({ directory: ROOT_DIR, path: currentPath() || '' });
    const list: FsEntry[] = (res.files || []).map((f: any) => ({
      name: f.name,
      fullPath: joinPath(currentPath(), f.name),
      isDirectory: f.type === 'directory',
      size: f.size,
      mtime: f.mtime,
      uri: f.uri,
      mimeType: f.type === 'file' ? guessMime(f.name) : undefined
    }))
        .sort((a, b) => (a.isDirectory !== b.isDirectory) ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name));

    entries.value = list;
  } catch (err) {
    console.error('readdir failed', err);
    entries.value = [];
  }
}

function enterFolder(entry: FsEntry) {
  if (!entry.isDirectory) return;
  pathStack.value.push(entry.name);
  refresh();
}
function goUp() { pathStack.value.pop(); refresh(); }
function openActions(entry: FsEntry) { actionEntry.value = entry; }

const actionButtons = computed(() => {
  if (!actionEntry.value) return [];
  const e = actionEntry.value;
  return [
    { text: e.isDirectory ? 'Ordner öffnen' : 'Datei öffnen', icon: openOutline, handler: () => e.isDirectory ? enterFolder(e) : openFile(e) },
    { text: 'Löschen', role: 'destructive', icon: trashOutline, handler: () => deleteEntry(e) },
    { text: 'Abbrechen', role: 'cancel' }
  ];
});

function openAddSheet() { isAddOpen.value = true; }

const addButtons = [
  { text: 'Leere Datei erstellen', handler: () => promptCreateFile() },
  { text: 'Datei importieren',     handler: () => importFilesFromDevice() },
  { text: 'Ordner erstellen',      handler: () => promptCreateFolder() },
  { text: 'Abbrechen', role: 'cancel' }
];

async function promptCreateFile() {
  const name = prompt('Dateiname (z. B. notes.txt):');
  if (!name) return;
  await createEmptyFile(name);
}
async function createEmptyFile(name: string) {
  try {
    const finalName = await ensureUniqueName(name, false);
    await Filesystem.writeFile({
      directory: ROOT_DIR,
      path: joinPath(currentPath(), finalName),
      data: '',
      recursive: true
    });
    await refresh();
  } catch (err) {
    console.error('writeFile failed', err);
    alert('Datei konnte nicht erstellt werden.');
  } finally { isAddOpen.value = false; }
}

async function ensureUniqueName(name: string, isDir: boolean): Promise<string> {
  const base = name.trim();
  if (!base) throw new Error('Ungültiger Name');
  let candidate = base, i = 1;
  while (await entryExists(candidate, isDir)) {
    const dot = candidate.lastIndexOf('.');
    candidate = (!isDir && dot > 0)
        ? `${candidate.slice(0, dot)} (${i++})${candidate.slice(dot)}`
        : `${base} (${i++})`;
  }
  return candidate;
}
async function entryExists(name: string, isDir: boolean): Promise<boolean> {
  try {
    const list = await Filesystem.readdir({ directory: ROOT_DIR, path: currentPath() || '' });
    const files: any[] = list.files || [];
    return files.some(f => f.name === name && (isDir ? f.type === 'directory' : f.type === 'file'));
  } catch { return false; }
}

async function promptCreateFolder() {
  const name = prompt('Name des neuen Ordners:');
  if (!name) return;
  await createFolder(name);
}
async function createFolder(name: string) {
  try {
    const finalName = await ensureUniqueName(name, true);
    await Filesystem.mkdir({ directory: ROOT_DIR, path: joinPath(currentPath(), finalName), recursive: false });
    await refresh();
  } catch (err) {
    console.error('mkdir failed', err);
    alert('Ordner konnte nicht erstellt werden.');
  } finally { isAddOpen.value = false; }
}

async function deleteEntry(entry: FsEntry) {
  try {
    if (entry.isDirectory) {
      await Filesystem.rmdir({ directory: ROOT_DIR, path: entry.fullPath, recursive: true });
    } else {
      await Filesystem.deleteFile({ directory: ROOT_DIR, path: entry.fullPath });
    }
    await refresh();
  } catch (err) {
    console.error('delete failed', err);
    alert('Löschen fehlgeschlagen.');
  } finally { actionEntry.value = null; }
}


async function openFile(entry: FsEntry) {
  try {
    const { uri } = await Filesystem.getUri({ directory: ROOT_DIR, path: entry.fullPath });
    const exactMime = entry.mimeType || guessMime(entry.name);
    const fileOpener2 = (window as any)?.cordova?.plugins?.fileOpener2;

    if (fileOpener2?.open) {
      // Erst mit exaktem MIME probieren
      try {
        await new Promise<void>((resolve, reject) => {
          fileOpener2.open(uri, exactMime, { error: (e: any) => reject(e), success: () => resolve() });
        });
        return;
      } catch (e) {
        // Dann breit mit */* (zeigt dem Nutzer ALLE Apps, die irgendwas können)
        try {
          await new Promise<void>((resolve, reject) => {
            fileOpener2.open(uri, '*/*', { error: (err: any) => reject(err), success: () => resolve() });
          });
          return;
        } catch (e2) {
          // weiter zum Share-Fallback
        }
      }
    }

    // Share-Fallback
    await Share.share({
      title: entry.name,
      url: uri,
      dialogTitle: 'Mit App öffnen'
    });
  } catch (err) {
    console.error('open file failed', err);
    alert('Datei konnte nicht geöffnet werden.');
  }
}

/**
 * Dateien importieren:
 * - liest Base64 (readData: true), schreibt in App-Verzeichnis
 * - bei fehlenden Base64-Daten fallback auf copyFile per URI
 * - auto-Umbenennung bei Kollision
 */
async function importFilesFromDevice() {
  try {
    const res = await (FilePicker as any).pickFiles({ multiple: true, readData: true });
    const picked = res.files || [];
    if (picked.length === 0) return;

    for (const file of picked) {
      const name = file.name || 'unbenannt';
      const targetName = await ensureUniqueName(name, false);
      const destPath = joinPath(currentPath(), targetName);
      const base64 = (file as any).data as string | undefined;

      if (base64) {
        await Filesystem.writeFile({
          directory: ROOT_DIR,
          path: destPath,
          data: base64,
          encoding: 'base64' as any,
          recursive: true
        });
      } else {
        const sourceUri = (file as any).uri || (file as any).path || (file as any).webPath;
        if (!sourceUri) continue;
        await (FilePicker as any).copyFile({
          sourcePath: sourceUri,
          directory: ROOT_DIR,
          path: destPath
        });
      }
    }
    await refresh();
  } catch (err: any) {
    if (String(err?.message || '').toLowerCase().includes('canceled')) return;
    console.error('importFilesFromDevice failed', err);
    alert('Import fehlgeschlagen.');
  } finally { isAddOpen.value = false; }
}

onMounted(() => refresh());
</script>

<style scoped>
ion-avatar {
  --border-radius: 8px;
  width: 36px;
  height: 36px;
  align-items: center;
  display: flex;
  justify-content: center;
  background: #eef2ff;
}
.with-gap { --padding-top: 16px; }
</style>
