
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Dateimanager</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showAddModal">
            <ion-icon :icon="add" slot="start"></ion-icon>
            Hinzufügen
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-list v-if="files.length > 0">
        <ion-item v-for="file in files" :key="file.path" @click="openActionSheet(file)" :style="{ 'padding-left': `${file.depth * 20}px` }">
          <ion-icon :icon="file.isDirectory ? folder : document" slot="start"></ion-icon>
          <ion-label>
            {{ file.name }} {{ file.isDirectory ? '(Ordner)' : '' }}
          </ion-label>
        </ion-item>
      </ion-list>
      <ion-text v-else>
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
        <ion-content>
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
        <ion-content>
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
    </ion-content>
  </ion-page>
</template>

<script setup>
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonList, IonItem, IonLabel, IonText,
  IonButton, IonModal, IonButtons, IonInput, IonSelect, IonSelectOption, IonActionSheet,
  IonIcon
} from '@ionic/vue';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { folder, document, add } from 'ionicons/icons';
import { ref, computed } from 'vue';

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

const directories = computed(() => {
  return files.value.filter(file => file.isDirectory);
});

const targetPath = computed(() => {
  if (!newItemName.value) return '';
  return targetFolder.value ? `${targetFolder.value}/${newItemName.value}` : `/${newItemName.value}`;
});

const copyTargetPath = computed(() => {
  if (!selectedFile.value || !selectedFile.value.name) return '';
  return copyTargetFolder.value ? `${copyTargetFolder.value}/${selectedFile.value.name}` : `/${selectedFile.value.name}`;
});

const actionSheetButtons = computed(() => [
  {
    text: 'Löschen',
    role: 'destructive',
    handler: () => deleteItem(selectedFile.value)
  },
  {
    text: 'Kopieren',
    handler: () => {
      if (selectedFile.value && !selectedFile.value.isDirectory) {
        copyTargetFolder.value = '';
        isCopyModalOpen.value = true;
      } else {
        errorMessage.value = 'Nur Dateien können kopiert werden.';
      }
    }
  },
  {
    text: 'Abbrechen',
    role: 'cancel'
  }
]);

const readDirectoryRecursively = async (path = '', depth = 0) => {
  try {
    const result = await Filesystem.readdir({
      path,
      directory: Directory.Data // App-specific directory
    });

    const fileList = [];
    for (const file of result.files) {
      const isDirectory = file.type === 'directory';
      fileList.push({
        name: file.name,
        path: `${path}/${file.name}`.replace(/^\/\//, '/'),
        isDirectory,
        depth
      });

      if (isDirectory) {
        const subFiles = await readDirectoryRecursively(`${path}/${file.name}`, depth + 1);
        fileList.push(...subFiles);
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
    if (Capacitor.getPlatform() === 'web') {
      console.warn('Dateisystemzugriff im Web ist eingeschränkt.');
      errorMessage.value = 'Dateisystemzugriff im Browser nicht verfügbar.';
      files.value = [];
      return;
    }

    const fileList = await readDirectoryRecursively('');
    files.value = fileList;
    if (files.value.length === 0) {
      errorMessage.value = 'Keine Dateien oder Ordner im Verzeichnis gefunden.';
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
      errorMessage.value = 'Bitte einen Namen angeben.';
      return;
    }

    const path = targetFolder.value ? `${targetFolder.value}/${newItemName.value}` : newItemName.value;

    if (newItemType.value === 'file') {
      await Filesystem.writeFile({
        path,
        data: 'Neue Datei', // Plain text
        directory: Directory.Data,
        encoding: Encoding.UTF8 // Explicitly specify UTF-8 encoding
      });
    } else {
      await Filesystem.mkdir({
        path,
        directory: Directory.Data
      });
    }

    isModalOpen.value = false;
    await readFileSystem(); // Refresh the file list
  } catch (error) {
    console.error('Fehler beim Erstellen:', error);
    errorMessage.value = `Fehler beim Erstellen: ${error.message}`;
  }
};

const copyItem = async () => {
  try {
    if (!selectedFile.value || !selectedFile.value.name) {
      errorMessage.value = 'Keine Datei ausgewählt.';
      return;
    }

    const sourcePath = selectedFile.value.path.replace(/^\//, '');
    const targetPath = copyTargetFolder.value ? `${copyTargetFolder.value}/${selectedFile.value.name}` : selectedFile.value.name;

    // Lese die Quelldatei
    const fileData = await Filesystem.readFile({
      path: sourcePath,
      directory: Directory.Data
      // Kein encoding für Binärdateien, um Base64-Fehler zu vermeiden
    });

    // Schreibe die Datei an den Zielpfad
    await Filesystem.writeFile({
      path: targetPath.replace(/^\//, ''),
      data: fileData.data,
      directory: Directory.Data
      // Kein encoding, da fileData.data Base64-Daten enthält
    });

    isCopyModalOpen.value = false;
    await readFileSystem(); // Refresh the file list
  } catch (error) {
    console.error('Fehler beim Kopieren der Datei:', error);
    errorMessage.value = `Fehler beim Kopieren: ${error.message}`;
  }
};

const deleteItem = async (file) => {
  try {
    if (file.isDirectory) {
      await Filesystem.rmdir({
        path: file.path.replace(/^\//, ''),
        directory: Directory.Data,
        recursive: true
      });
    } else {
      await Filesystem.deleteFile({
        path: file.path.replace(/^\//, ''),
        directory: Directory.Data
      });
    }
    await readFileSystem(); // Refresh the file list
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    errorMessage.value = `Fehler beim Löschen: ${error.message}`;
  }
};

const openActionSheet = (file) => {
  selectedFile.value = file;
  isActionSheetOpen.value = true;
};

// Load files on component mount
readFileSystem();
</script>

<style scoped>
ion-icon {
  font-size: 24px;
  margin-right: 8px;
}
</style>
