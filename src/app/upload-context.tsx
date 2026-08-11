"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type UploadContextValue = {
  files: File[];
  setFiles: (files: File[]) => void;
  clearFiles: () => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<File[]>([]);
  const value = useMemo(
    () => ({ files, setFiles, clearFiles: () => setFiles([]) }),
    [files]
  );
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUploads måste användas inom UploadProvider");
  return context;
}

export function UploadPanel() {
  const { files, setFiles, clearFiles } = useUploads();
  return (
    <div style={{ padding: "12px 24px", borderBottom: "1px solid #d5e3db", background: "#f7fbf8" }}>
      <label htmlFor="sie-upload"><strong>Ladda upp SIE4-filer</strong></label>
      <input
        id="sie-upload"
        type="file"
        accept=".se"
        multiple
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        style={{ marginLeft: 12 }}
      />
      {files.length ? (
        <span style={{ marginLeft: 12 }}>
          {files.length} fil{files.length === 1 ? "" : "er"} i minnet
          <button type="button" onClick={clearFiles} style={{ marginLeft: 8 }}>Rensa</button>
        </span>
      ) : (
        <span style={{ marginLeft: 12 }}>Inget sparas när sidan stängs.</span>
      )}
    </div>
  );
}
