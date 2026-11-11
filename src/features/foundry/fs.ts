/**
 * A tiny read-only file tree, so project scanning does not care whether the
 * folder came from drag and drop, the folder picker, or a plain <input>.
 * Nothing is read until `text()` or `children()` is called, which keeps large
 * projects (lib/, node_modules/) cheap: we only ever open what we need.
 */

export type FsFile = { kind: "file"; name: string; text(): Promise<string> };
export type FsDir = {
  kind: "directory";
  name: string;
  children(): Promise<FsNode[]>;
};
export type FsNode = FsFile | FsDir;

/* ---------- Drag and drop (webkit entries; Chrome, Edge, Firefox, Safari) ---------- */

function readAllEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  // readEntries returns at most ~100 entries per call, so keep reading.
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

export function fsNodeFromEntry(entry: FileSystemEntry): FsNode {
  if (entry.isDirectory) {
    const directory = entry as FileSystemDirectoryEntry;
    return {
      kind: "directory",
      name: entry.name,
      children: async () =>
        (await readAllEntries(directory.createReader())).map(fsNodeFromEntry),
    };
  }
  const file = entry as FileSystemFileEntry;
  return {
    kind: "file",
    name: entry.name,
    text: () =>
      new Promise<string>((resolve, reject) =>
        file.file((value) => value.text().then(resolve, reject), reject),
      ),
  };
}

/**
 * Must be called synchronously inside the drop handler: the DataTransfer is
 * emptied as soon as the handler returns. The returned entry stays valid.
 */
export function droppedDirectory(
  dataTransfer: DataTransfer,
): FileSystemDirectoryEntry | undefined {
  for (const item of Array.from(dataTransfer.items)) {
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) return entry as FileSystemDirectoryEntry;
  }
  return undefined;
}

export function fsDirFromEntry(entry: FileSystemDirectoryEntry): FsDir {
  return fsNodeFromEntry(entry) as FsDir;
}

/* ---------- Folder picker (File System Access API; Chrome and Edge) ---------- */

type HandleLike =
  | { kind: "file"; name: string; getFile(): Promise<File> }
  | {
      kind: "directory";
      name: string;
      entries(): AsyncIterable<[string, HandleLike]>;
    };

function fsNodeFromHandle(handle: HandleLike): FsNode {
  if (handle.kind === "directory") {
    return {
      kind: "directory",
      name: handle.name,
      children: async () => {
        const nodes: FsNode[] = [];
        for await (const [, child] of handle.entries()) {
          nodes.push(fsNodeFromHandle(child));
        }
        return nodes;
      },
    };
  }
  return {
    kind: "file",
    name: handle.name,
    text: async () => (await handle.getFile()).text(),
  };
}

export function canPickDirectory(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Returns undefined when the user cancels the picker. */
export async function pickDirectory(): Promise<FsDir | undefined> {
  const picker = (
    window as unknown as {
      showDirectoryPicker: (options?: { mode?: "read" }) => Promise<HandleLike>;
    }
  ).showDirectoryPicker;
  try {
    const handle = await picker.call(window, { mode: "read" });
    return fsNodeFromHandle(handle) as FsDir;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return undefined;
    }
    throw error;
  }
}

/* ---------- <input type="file" webkitdirectory> (works everywhere) ---------- */

type MutableDir = { name: string; dirs: Map<string, MutableDir>; files: File[] };

function toFsDir(dir: MutableDir): FsDir {
  return {
    kind: "directory",
    name: dir.name,
    children: async () => [
      ...[...dir.dirs.values()].map(toFsDir),
      ...dir.files.map(
        (file): FsFile => ({
          kind: "file",
          name: file.name,
          text: () => file.text(),
        }),
      ),
    ],
  };
}

/** Build a tree from `webkitRelativePath` ("project/broadcast/..."). */
export function fsDirFromFileList(
  files: ArrayLike<File>,
): FsDir | undefined {
  let root: MutableDir | undefined;

  for (const file of Array.from(files)) {
    const parts = (file.webkitRelativePath || file.name).split("/");
    if (parts.length < 2) continue;
    root ??= { name: parts[0], dirs: new Map(), files: [] };

    let current = root;
    for (const part of parts.slice(1, -1)) {
      let child = current.dirs.get(part);
      if (!child) {
        child = { name: part, dirs: new Map(), files: [] };
        current.dirs.set(part, child);
      }
      current = child;
    }
    current.files.push(file);
  }

  return root ? toFsDir(root) : undefined;
}
