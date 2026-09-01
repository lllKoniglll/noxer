"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type StoredFile = { name: string; size: number };
type UploadContextValue = {
  files: File[];
  setFiles: (files: File[]) => void;
  clearFiles: () => void;
  isLoading: boolean;
  storageError: string | null;
  group: string | null;
};

const UploadContext = createContext<UploadContextValue | null>(null);

async function loadServerFiles(): Promise<{ files: File[]; group: string }> {
  const response = await fetch("/api/files", { cache: "no-store" });
  if (!response.ok) throw new Error("Kunde inte läsa gruppens filer");
  const listing = (await response.json()) as { group: string; files: StoredFile[] };
  const files = await Promise.all(listing.files.map(async (entry) => {
    const fileResponse = await fetch(`/api/files/${encodeURIComponent(entry.name)}`, { cache: "no-store" });
    if (!fileResponse.ok) throw new Error(`Kunde inte läsa ${entry.name}`);
    return new File([await fileResponse.arrayBuffer()], entry.name, { type: "application/octet-stream" });
  }));
  return { files, group: listing.group };
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return new Error(payload.detail ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [files, setFilesState] = useState<File[]>([]);
  const [group, setGroup] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const result = await loadServerFiles();
      setFilesState(result.files);
      setGroup(result.group);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Gruppens filer kunde inte läsas");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const replaceFiles = (nextFiles: File[]) => {
    void (async () => {
      try {
        for (const file of nextFiles) {
          const body = new FormData();
          body.append("file", file, file.name);
          const response = await fetch("/api/files", { method: "POST", body });
          if (!response.ok) throw await responseError(response, `Kunde inte spara ${file.name}`);
        }
        await refresh();
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : "Filerna kunde inte sparas på servern");
      }
    })();
  };

  const removeFiles = () => {
    void (async () => {
      try {
        for (const file of files) {
          const response = await fetch(`/api/files/${encodeURIComponent(file.name)}`, { method: "DELETE" });
          if (!response.ok) throw new Error(`Kunde inte radera ${file.name}`);
        }
        await refresh();
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : "Filerna kunde inte raderas");
      }
    })();
  };

  const value = { files, setFiles: replaceFiles, clearFiles: removeFiles, isLoading, storageError, group };
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUploads måste användas inom UploadProvider");
  return context;
}

export function UploadPanel() {
  const { files, setFiles, clearFiles, isLoading, storageError, group } = useUploads();
  return (
    <div style={{ padding: "12px 24px", borderBottom: "1px solid #d5e3db", background: "#f7fbf8" }}>
      <label htmlFor="sie-upload"><strong>Ladda upp SIE4-filer</strong></label>
      <input id="sie-upload" type="file" accept=".se,.sie,.se4,text/plain,application/octet-stream" multiple onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))} style={{ marginLeft: 12 }} />
      {files.length ? <span style={{ marginLeft: 12 }}>{files.length} fil{files.length === 1 ? "" : "er"} i {group ?? "gruppen"}<button type="button" onClick={clearFiles} style={{ marginLeft: 8 }}>Rensa</button></span> : <span style={{ marginLeft: 12 }}>{isLoading ? "Läser gruppens filer..." : "Inga SIE4-filer uppladdade."}</span>}
      {storageError ? <small role="alert" style={{ marginLeft: 12, color: "#a33" }}>{storageError}</small> : null}
    </div>
  );
}
