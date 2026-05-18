export function parseAtlasPageNames(atlasText) {
  const lines = String(atlasText || '').split(/\r?\n/);
  const pages = [];
  let expectingPage = true;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      expectingPage = true;
      continue;
    }
    if (expectingPage && !line.includes(':')) {
      pages.push(line);
      expectingPage = false;
    }
  }

  return pages;
}

export function buildAtlasImageFileMap(pageNames, imageFiles) {
  const fileMap = new Map();
  const warnings = [];
  const files = [...(imageFiles || [])];
  const byName = new Map(files.map((file) => [file.name.toLowerCase(), file]));
  const byBase = new Map(files.map((file) => [baseName(file.name), file]));

  if (!pageNames.length) {
    if (files[0]) {
      fileMap.set('default', files[0]);
      warnings.push('No atlas page names were found, so the first image will be used as the default texture source.');
    }
    return { fileMap, warnings };
  }

  for (const pageName of pageNames) {
    let file = byName.get(pageName.toLowerCase()) || byBase.get(baseName(pageName));
    if (!file) {
      file = files[0];
      warnings.push(`Atlas page "${pageName}" did not match an uploaded image, so "${file?.name || 'the first image'}" will be used.`);
    }
    if (file) fileMap.set(pageName, file);
  }

  return { fileMap, warnings };
}

export async function readSkeletonAsset(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.json')) {
    const text = await file.text();

    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !('bones' in parsed)) {
        throw new Error('JSON is missing the required "bones" field.');
      }
      return parsed;
    } catch (error) {
      throw new Error(`Failed to parse skeleton JSON: ${error?.message || error}`);
    }
  }

  if (lowerName.endsWith('.skel') || lowerName.endsWith('.bytes')) {
    return new Uint8Array(await file.arrayBuffer());
  }

  throw new Error(`Unsupported skeleton file type: ${file.name}. Please import a .json, .skel, or .bytes file.`);
}

function baseName(name) {
  return String(name).split('/').pop().split('\\').pop().toLowerCase();
}
