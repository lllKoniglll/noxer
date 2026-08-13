"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  loadStoredSieUploads,
  replaceStoredSieUploads
} from "@/lib/storage/sie-upload-store";

type UploadContextValue = {
  files: File[];
  setFiles: (files: File[]) => void;
  clearFiles: () => void;
  isLoading: boolean;
  storageError: string | null;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<File[]>([]);
  // IndexedDB ska aldrig blockera själva filväljaren.
  const [isLoading, setIsLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const userChangedFiles = useRef(false);

  useEffect(() => {
    let active = true;
    const fallback = window.setTimeout(() => {
      if (active) {
        setStorageError("Lokal lagring svarar inte. Du kan ändå ladda upp filer, men de sparas inte förrän lagringen fungerar igen.");
        setIsLoading(false);
      }
    }, 2000);

    loadStoredSieUploads()
      .then((storedFiles) => {
        if (active && !userChangedFiles.current) setFiles(storedFiles);
      })
      .catch(() => {
        if (active) setStorageError("Kunde inte läsa sparade SIE4-filer från webbläsaren.");
      })
      .finally(() => {
        if (active) {
          window.clearTimeout(fallback);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    if (!userChangedFiles.current) return;

    void replaceStoredSieUploads(files)
      .then(() => setStorageError(null))
      .catch(() => setStorageError("Filerna kunde inte sparas lokalt i webbläsaren."));
  }, [files]);

  const replaceFiles = (nextFiles: File[]) => {
    userChangedFiles.current = true;
    // Filändelsen varierar mellan SIE-exporter (.se, .sie, .se4 eller ingen ändelse).
    // Acceptera därför alla filer som användaren uttryckligen valt i filväljaren.
    setFiles(nextFiles);
  };

  const removeFiles = () => {
    userChangedFiles.current = true;
    setFiles([]);
  };

  const value = { files, setFiles: replaceFiles, clearFiles: removeFiles, isLoading, storageError };
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUploads måste användas inom UploadProvider");
  return context;
}

export function UploadPanel() {
  const { files, setFiles, clearFiles, isLoading, storageError } = useUploads();
  return (
    <div style={{ padding: "12px 24px", borderBottom: "1px solid #d5e3db", background: "#f7fbf8" }}>
      <label htmlFor="sie-upload"><strong>Ladda upp SIE4-filer</strong></label>
      <input
        id="sie-upload"
        type="file"
        accept=".se,.sie,.se4,text/plain,application/octet-stream"
        multiple
        onChange={(event) => {
          const selectedFiles = Array.from(event.currentTarget.files ?? []);
          setFiles(selectedFiles);
        }}
        style={{ marginLeft: 12 }}
      />
      {files.length ? (
        <span style={{ marginLeft: 12 }}>
          {files.length} fil{files.length === 1 ? "" : "er"} sparad{files.length === 1 ? "" : "e"} lokalt
          <button type="button" onClick={clearFiles} style={{ marginLeft: 8 }}>Rensa</button>
        </span>
      ) : (
        <span style={{ marginLeft: 12 }}>{isLoading ? "Läser sparade filer i bakgrunden..." : "Inga SIE4-filer uppladdade."}</span>
      )}
      {storageError ? <small role="alert" style={{ marginLeft: 12, color: "#a33" }}>{storageError}</small> : null}
    </div>
  );
}
