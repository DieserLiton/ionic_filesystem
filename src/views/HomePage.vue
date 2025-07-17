```vue
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Dateimanager</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-list v-if="files.length > 0">
        <ion-item v-for="file in filteredFiles" :key="file.path" @click="toggleFile(file)" :style="{ 'padding-left': `${file.depth * 20}px` }" button>
          <ion-checkbox v-if="isSelectionMode" slot="start" :checked="selectedItems[file.path]" @ionChange="selectedItems[file.path] = $event.detail.checked" />
          <ion-icon :icon="file.isDirectory ? folder : document" :color="file.isDirectory && file.expanded ? 'primary' : ''" slot="start" />
          <ion-label>
            {{ file.name }}
          </ion-label>
          <ion-icon v-if="file.isDirectory" :icon="file.expanded ? remove : add" slot="end" @click.stop="toggleExpand(file)" />
        </ion-item>
      </ion-list>
      <ion-text v-else class="ion-padding">
        <p>{{ errorMessage || 'Keine Dateien gefunden.' }}</p>
      </ion-text>

      <ion-modal :is-open="isModalOpen" @didDismiss="isModalOpen = false">
        <ion-header>
          <ion-toolbar>
            <ion-title>Neue Datei/Ordner</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="isModalOpen = false">Abbrechen</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-item>
            <ion-label position="stacked">Name</ion-label>
            <ion-input v-model="newItemName" placeholder="Name eingeben"></ion-input>
          </ion-item>
          <ion-item>
            <ion-label>Typ</ion-label>
            <ion-select v-model="newItemType" placeholder="Typ auswählen">
              <ion-select-option value="file">Datei</ion-select-option>
              <ion-select-option value="directory">Ordner</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label>Zielordner</ion-label>
            <ion-select v-model="targetFolder" placeholder="Ordner auswählen">
              <ion-select-option value="">Stammverzeichnis</ion-select-option>
              <ion-select-option v-for="folder in directories" :key="folder.path" :value="folder.path">
                {{ folder.name }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label>Speicherort</ion-label>
            <ion-text>{{ targetPath || 'Bitte Name und Zielordner auswählen' }}</ion-text>
          </ion-item>
          <ion-button expand="block" @click="createItem">Erstellen</ion-button>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="isCopyModalOpen" @didDismiss="isCopyModalOpen = false">
        <ion-header>
          <ion-toolbar>
            <ion-title>Datei kopieren</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="isCopyModalOpen = false">Abbrechen</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-item>
            <ion-label>Datei</ion-label>
            <ion-text>{{ selectedFile?.name || 'Keine Datei ausgewählt' }}</ion-text>
          </ion-item>
          <ion-item>
            <ion-label>Zielordner</ion-label>
            <ion-select v-model="copyTargetFolder" placeholder="Ordner auswählen">
              <ion-select-option value="">Stammverzeichnis</ion-select-option>
              <ion-select-option v-for="folder in directories" :key="folder.path" :value="folder.path">
                {{ folder.name }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label>Speicherort</ion-label>
            <ion-text>{{ copyTargetPath || 'Bitte Zielordner auswählen' }}</ion-text>
          </ion-item>
          <ion-button expand="block" @click="copyItem">Kopieren</ion-button>
        </ion-content>
      </ion-modal>

      <ion-action-sheet
          :is-open="isActionSheetOpen"
          header="Aktionen"
          :buttons="actionSheetButtons"
          @didDismiss="isActionSheetOpen = false"
      ></ion-action-sheet>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button color="primary" @click="showAddModal">
          <ion-icon :icon="add"></ion-icon>
        </ion-fab-button>
        <ion-fab-list side="top">
          <ion-fab-button v-if="!isSelectionMode" color="secondary" @click="toggleSelectionMode">
            <ion-icon :icon="checkbox"></ion-icon>
          </ion-fab-button>
          <ion-fab-button v-else color="danger" @click="deleteSelectedItems">
            <ion-icon :icon="trash"></ion-icon>
          </ion-fab-button>
        </ion-fab-list>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup>
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonList, IonItem, IonLabel, IonText,
  IonButton, IonModal, IonButtons, IonInput, IonSelect, IonSelectOption, IonActionSheet,
  IonIcon, IonCheckbox, IonFab, IonFabButton, IonFabList
} from '@ionic/vue';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { Capacitor } from '@capacitor/core';
import { folder, document, add, remove, checkbox, trash } from 'ionicons/icons';
import { ref, computed, watch, onMounted } from 'vue';

const files = ref([]);
const errorMessage = ref('');
const isModalOpen = ref(false);
const newItemName = ref('');
const newItemType = ref('file');
const targetFolder = ref('');
const isActionSheetOpen = ref(false);
const isCopyModalOpen = ref(false);
const copyTargetFolder = ref('');
const selectedFile = ref(null);
const isSelectionMode = ref(false);
const selectedItems = ref({});

const directories = computed(() => files.value.filter(file => file.isDirectory));

const targetPath = computed(() => {
  if (!newItemName.value) return '';
  return targetFolder.value ? `${targetFolder.value}/${newItemName.value}` : `${newItemName.value}`;
});

const copyTargetPath = computed(() => {
  if (!selectedFile.value || !selectedFile.value.name) return '';
  return copyTargetFolder.value ? `${copyTargetFolder.value}/${selectedFile.value.name}` : `${selectedFile.value.name}`;
});

const filteredFiles = computed(() => {
  return files.value.filter(file => {
    if (!file.parentPath) return true;
    let current = file;
    while(current.parentPath) {
      const parent = files.value.find(f => f.path === current.parentPath);
      if(!parent || !parent.expanded) return false;
      current = parent;
    }
    return true;
  });
});

const actionSheetButtons = computed(() => [
  {
    text: 'Öffnen',
    handler: () => {
      if (selectedFile.value && !selectedFile.value.isDirectory) {
        openFile(selectedFile.value);
      }
    }
  },
  {
    text: 'Kopieren',
    handler: () => {
      if (selectedFile.value && !selectedFile.value.isDirectory) {
        copyTargetFolder.value = '';
        isCopyModalOpen.value = true;
      }
    }
  },
  {
    text: 'Löschen',
    role: 'destructive',
    handler: () => deleteItem(selectedFile.value)
  },
  {
    text: 'Abbrechen',
    role: 'cancel'
  }
]);

const toggleFile = (file) => {
  if (isSelectionMode.value) {
    selectedItems.value[file.path] = !selectedItems.value[file.path];
  } else if (file.isDirectory) {
    toggleExpand(file);
  } else {
    selectedFile.value = file;
    isActionSheetOpen.value = true;
  }
};

const toggleExpand = (file) => {
  if (file.isDirectory) {
    file.expanded = !file.expanded;
  }
};

const readDirectoryRecursively = async (path = '', depth = 0) => {
  try {
    const result = await Filesystem.readdir({
      path,
      directory: Directory.Data
    });

    let fileList = [];
    for (const file of result.files) {
      const isDirectory = file.type === 'directory';
      const newPath = path ? `${path}/${file.name}` : file.name;

      fileList.push({
        name: file.name,
        path: newPath,
        isDirectory,
        depth,
        expanded: false,
        parentPath: path
      });

      if (isDirectory) {
        const subFiles = await readDirectoryRecursively(newPath, depth + 1);
        fileList = fileList.concat(subFiles);
      }
    }
    return fileList;
  } catch (error) {
    console.error(`Fehler beim Lesen des Verzeichnisses ${path}:`, error);
    return [];
  }
};

const readFileSystem = async () => {
  try {
    errorMessage.value = '';
    if (Capacitor.getPlatform() === 'web') {
      errorMessage.value = 'Dateisystemzugriff im Browser ist nicht vollumfänglich verfügbar.';
      files.value = [];
      return;
    }

    const fileList = await readDirectoryRecursively();
    files.value = fileList.sort((a, b) => a.path.localeCompare(b.path));
    if (files.value.length === 0) {
      errorMessage.value = 'Keine Dateien oder Ordner gefunden.';
    }
  } catch (error) {
    console.error('Fehler beim Lesen des Dateisystems:', error);
    errorMessage.value = `Fehler beim Lesen: ${error.message}`;
    files.value = [];
  }
};

const showAddModal = () => {
  newItemName.value = '';
  newItemType.value = 'file';
  targetFolder.value = '';
  isModalOpen.value = true;
};

const createItem = async () => {
  try {
    if (!newItemName.value) {
      return;
    }

    const path = targetPath.value;

    if (newItemType.value === 'file') {
      await Filesystem.writeFile({
        path,
        data: 'Neue Datei',
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });
    } else {
      await Filesystem.mkdir({
        path,
        directory: Directory.Data,
        recursive: true
      });
    }

    isModalOpen.value = false;
    await readFileSystem();
  } catch (error) {
    console.error('Fehler beim Erstellen:', error);
    errorMessage.value = `Fehler beim Erstellen: ${error.message}`;
  }
};

const copyItem = async () => {
  try {
    if (!selectedFile.value) {
      return;
    }

    await Filesystem.copy({
      from: selectedFile.value.path,
      to: copyTargetPath.value,
      directory: Directory.Data,
      toDirectory: Directory.Data
    });

    isCopyModalOpen.value = false;
    await readFileSystem();
  } catch (error) {
    console.error('Fehler beim Kopieren der Datei:', error);
    errorMessage.value = `Fehler beim Kopieren: ${error.message}`;
  }
};

const deleteItem = async (file) => {
  try {
    if (file.isDirectory) {
      await Filesystem.rmdir({
        path: file.path,
        directory: Directory.Data,
        recursive: true
      });
    } else {
      await Filesystem.deleteFile({
        path: file.path,
        directory: Directory.Data
      });
    }
    await readFileSystem();
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    errorMessage.value = `Fehler beim Löschen: ${error.message}`;
  }
};

const deleteSelectedItems = async () => {
  try {
    const itemsToDelete = Object.keys(selectedItems.value).filter(path => selectedItems.value[path]);

    for (const path of itemsToDelete) {
      const file = files.value.find(f => f.path === path);
      if (file) {
        if (file.isDirectory) {
          await Filesystem.rmdir({ path, directory: Directory.Data, recursive: true });
        } else {
          await Filesystem.deleteFile({ path, directory: Directory.Data });
        }
      }
    }

    isSelectionMode.value = false;
    selectedItems.value = {};
    await readFileSystem();
  } catch (error) {
    console.error('Fehler beim Löschen mehrerer Items:', error);
    errorMessage.value = `Fehler beim Löschen: ${error.message}`;
  }
};

const openFile = async (file) => {
  try {
    const mimeType = getMimeType(file.name);

    const fileUri = await Filesystem.getUri({
      directory: Directory.Data,
      path: file.path,
    });

    await FileOpener.open({
      filePath: fileUri.uri,
      contentType: mimeType,
    });
  } catch (error) {
    console.error('Fehler beim Öffnen der Datei:', error);
    errorMessage.value = `Fehler beim Öffnen: ${error.message || 'Datei konnte nicht geöffnet werden.'}`;
  }
};

const getMimeType = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes = {
    txt: 'text/plain',
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    mp4: 'video/mp4',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value;
  if (!isSelectionMode.value) {
    selectedItems.value = {};
  }
};

watch(isSelectionMode, (newVal) => {
  if (!newVal) selectedItems.value = {};
});

onMounted(() => {
  readFileSystem();
});
</script>

<style scoped>
ion-icon {
  font-size: 24px;
}
ion-item {
  --inner-padding-start: 16px;
}
.ion-padding {
  padding: 16px;
}
ion-fab-button {
  --background: var(--ion-color-primary);
  --background-activated: var(--ion-color-primary-shade);
}
ion-fab-list ion-fab-button {
  --background: var(--ion-color-secondary);
  --background-activated: var(--ion-color-secondary-shade);
}
ion-fab-list ion-fab-button:nth-child(2) {
  --background: var(--ion-color-danger);
  --background-activated: var(--ion-color-danger-shade);
}
</style>
