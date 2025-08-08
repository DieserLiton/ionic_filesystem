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

    <!-- Mehr Abstand oben -->
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

      <!-- Action Sheet pro Eintrag -->
      <ion-action-sheet
          :is-open="actionEntry !== null"
          header="Aktionen"
          :buttons="actionButtons"
          @didDismiss="actionEntry = null"
      >
      </ion-action-sheet>

      <!-- FAB: Hinzufügen -->
      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="openAddSheet" aria-label="Hinzufügen">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>

      <!-- Action Sheet: Hinzufügen -->
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

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Share } from '@capacitor/share';

type FsEntry = {
  name: string;
  fullPath: string;      // relativ zum Root (Directory.Data)
  isDirectory: boolean;
  size?: number;
  mtime?: number;
  uri?: string;          // falls Filesystem.readdir liefert
  mimeType?: string;     // für Dateien (geschätzt über Extension)
};

const ROOT_DIR = Directory.Data; // App-intern (Android/iOS)
const pathStack = ref<string[]>([]); // z.B. ['Fotos','Urlaub']

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
    'txt': 'text/plain',
    'pdf': 'application/pdf',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'mp4': 'video/mp4',
    'mp3': 'audio/mpeg',
    'json': 'application/json',
    'csv': 'text/csv',
    'zip': 'application/zip'
  };
  return map[ext] || 'application/octet-stream';
}

async function refresh() {
  try {
    const res = await Filesystem.readdir({
      directory: ROOT_DIR,
      path: currentPath() || ''
    });

    // Filesystem v6/7: { files: [{ name, type, size, mtime, uri }] }
    const list: FsEntry[] = (res.files || []).map((f: any) => ({
      name: f.name,
      fullPath: joinPath(currentPath(), f.name),
      isDirectory: f.type === 'directory',
      size: f.size,
      mtime: f.mtime,
      uri: f.uri,
      mimeType: f.type === 'file' ? guessMime(f.name) : undefined
    }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

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

function goUp() {
  pathStack.value.pop();
  refresh();
}

function openActions(entry: FsEntry) {
  actionEntry.value = entry;
}

const actionButtons = computed(() => {
  if (!actionEntry.value) return [];
  const e = actionEntry.value;
  return [
    {
      text: e.isDirectory ? 'Ordner öffnen' : 'Datei öffnen',
      icon: openOutline,
      handler: () => e.isDirectory ? enterFolder(e) : openFile(e)
    },
    {
      text: 'Löschen',
      role: 'destructive',
      icon: trashOutline,
      handler: () => deleteEntry(e)
    },
    {
      text: 'Abbrechen',
      role: 'cancel'
    }
  ];
});

function openAddSheet() {
  isAddOpen.value = true;
}

const addButtons = [
  {
    text: 'Leere Datei erstellen',
    handler: () => promptCreateFile()
  },
  {
    text: 'Datei importieren',
    handler: () => importFilesFromDevice()
  },
  {
    text: 'Ordner erstellen',
    handler: () => promptCreateFolder()
  },
  {
    text: 'Abbrechen',
    role: 'cancel'
  }
];

async function promptCreateFile() {
  const name = prompt('Dateiname (z. B. notes.txt):');
  if (!name) return;
  await createEmptyFile(name);
}

async function createEmptyFile(name: string) {
  try {
    const finalName = await ensureUniqueName(name, /*isDir*/ false);
    await Filesystem.writeFile({
      directory: ROOT_DIR,
      path: joinPath(currentPath(), finalName),
      data: '',            // leere Datei
      recursive: true
    });
    await refresh();
  } catch (err) {
    console.error('writeFile failed', err);
    alert('Datei konnte nicht erstellt werden.');
  } finally {
    isAddOpen.value = false;
  }
}

async function ensureUniqueName(name: string, isDir: boolean): Promise<string> {
  const base = name.trim();
  if (!base) throw new Error('Ungültiger Name');

  let candidate = base;
  let i = 1;

  while (await entryExists(candidate, isDir)) {
    const dot = candidate.lastIndexOf('.');
    if (!isDir && dot > 0) {
      const stem = candidate.slice(0, dot);
      const ext  = candidate.slice(dot);
      candidate = `${stem} (${i++})${ext}`;
    } else {
      candidate = `${base} (${i++})`;
    }
  }
  return candidate;
}

async function entryExists(name: string, isDir: boolean): Promise<boolean> {
  try {
    const list = await Filesystem.readdir({
      directory: ROOT_DIR,
      path: currentPath() || ''
    });
    const files: any[] = list.files || [];
    return files.some(f => f.name === name && (isDir ? f.type === 'directory' : f.type === 'file'));
  } catch {
    return false;
  }
}

async function promptCreateFolder() {
  const name = prompt('Name des neuen Ordners:');
  if (!name) return;
  await createFolder(name);
}

async function createFolder(name: string) {
  try {
    const finalName = await ensureUniqueName(name, /*isDir*/ true);
    await Filesystem.mkdir({
      directory: ROOT_DIR,
      path: joinPath(currentPath(), finalName),
      recursive: false
    });
    await refresh();
  } catch (err) {
    console.error('mkdir failed', err);
    alert('Ordner konnte nicht erstellt werden.');
  } finally {
    isAddOpen.value = false;
  }
}

async function deleteEntry(entry: FsEntry) {
  try {
    if (entry.isDirectory) {
      await Filesystem.rmdir({
        directory: ROOT_DIR,
        path: entry.fullPath,
        recursive: true
      });
    } else {
      await Filesystem.deleteFile({
        directory: ROOT_DIR,
        path: entry.fullPath
      });
    }
    await refresh();
  } catch (err) {
    console.error('delete failed', err);
    alert('Löschen fehlgeschlagen.');
  } finally {
    actionEntry.value = null;
  }
}

/**
 * Datei öffnen:
 * 1) Wenn cordova-plugin-file-opener2 vorhanden ist → direkt öffnen
 * 2) Fallback → System-Share-Sheet
 */
async function openFile(entry: FsEntry) {
  try {
    const { uri } = await Filesystem.getUri({
      directory: ROOT_DIR,
      path: entry.fullPath
    });
    const mime = entry.mimeType || guessMime(entry.name);

    const fileOpener2 = (window as any)?.cordova?.plugins?.fileOpener2;

    if (fileOpener2 && typeof fileOpener2.open === 'function') {
      await new Promise<void>((resolve, reject) => {
        fileOpener2.open(
            uri,
            mime,
            { error: (e: any) => reject(e), success: () => resolve() }
        );
      });
    } else {
      await Share.share({
        title: entry.name,
        url: uri,
        dialogTitle: 'Mit App öffnen'
      });
    }
  } catch (err) {
    console.error('open file failed', err);
    alert('Datei konnte nicht geöffnet werden.');
  }
}

/**
 * Dateien per System-Filepicker importieren:
 * - multiple Auswahl
 * - liest Base64 (readData: true) und schreibt als Datei in das aktuelle App-Verzeichnis
 * - automatische Umbenennung bei Kollisionen
 */
async function importFilesFromDevice() {
  try {
    const res = await FilePicker.pickFiles({ multiple: true, readData: true });
    const picked = res.files || [];
    if (picked.length === 0) return;

    for (const file of picked) {
      const name = file.name || 'unbenannt';
      const data = (file as any).data as string | undefined; // Base64
      if (!data) {
        console.warn('Kein Base64-Datenfeld enthalten, überspringe:', file);
        continue;
      }

      const targetName = await ensureUniqueName(name, /*isDir*/ false);
      const destPath = joinPath(currentPath(), targetName);

      await Filesystem.writeFile({
        directory: ROOT_DIR,
        path: destPath,
        data,               // Base64
        encoding: Encoding.BASE64,
        recursive: true
      });
    }

    await refresh();
  } catch (err: any) {
    if (String(err?.message || '').toLowerCase().includes('canceled')) return;
    console.error('importFilesFromDevice failed', err);
    alert('Import fehlgeschlagen.');
  } finally {
    isAddOpen.value = false;
  }
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

/* Mehr Luft zwischen Pfadleiste (Header) und Liste */
.with-gap {
  --padding-top: 16px;
}
</style>
