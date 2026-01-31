const form = document.querySelector('form');
const statusBox = document.getElementById('uploadStatus');
const folderTree = document.getElementById('folderTree');
const selectedFolder = document.getElementById('selectedFolder');
const indexButton = document.getElementById('indexButton');
const indexAllButton = document.getElementById('indexAllButton');

function setStatus(message, type = 'info') {
  if (!statusBox) return;
  statusBox.innerHTML = `<strong>Statut:</strong> <span>${message}</span>`;
  statusBox.dataset.type = type;
  statusBox.classList.remove('border-emerald-500', 'border-rose-500', 'border-sky-500');
  if (type === 'success') statusBox.classList.add('border-emerald-500');
  if (type === 'error') statusBox.classList.add('border-rose-500');
  if (type === 'info') statusBox.classList.add('border-sky-500');
  statusBox.hidden = false;
}

function setIndexStatus(message, type = 'info') {
  setStatus(message, type);
}

function createTreeNode(node) {
  const li = document.createElement('li');

  const details = document.createElement('details');
  details.open = false;

  const summary = document.createElement('summary');
  summary.className = 'cursor-pointer select-none text-slate-200 hover:text-sky-400';
  summary.textContent = node.name;
  summary.dataset.path = node.path;

  details.appendChild(summary);

  if (node.children && node.children.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'ml-4 mt-1 space-y-1';
    node.children.forEach(child => ul.appendChild(createTreeNode(child)));
    details.appendChild(ul);
  }

  li.appendChild(details);
  return li;
}

async function loadFolderTree() {
  if (!folderTree) return;

  folderTree.innerHTML = '<li>Chargement...</li>';

  try {
    const response = await fetch('/admin/api/folders?scope=corpus');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'Erreur de chargement');
    }

    folderTree.innerHTML = '';

    if (!data.tree || data.tree.length === 0) {
      folderTree.innerHTML = '<li>Aucun sous-dossier</li>';
      return;
    }

    data.tree.forEach(node => {
      folderTree.appendChild(createTreeNode(node));
    });
  } catch (error) {
    folderTree.innerHTML = '<li>Erreur de chargement</li>';
  }
}

folderTree?.addEventListener('click', (event) => {
  const summary = event.target.closest('summary');
  if (!summary) return;

  const path = summary.dataset.path || '';
  if (selectedFolder) {
    selectedFolder.value = path;
  }
});

async function triggerIndex(payload) {
  setIndexStatus('Indexation en cours...', 'info');

  try {
    const response = await fetch('/admin/api/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.error || 'Erreur lors de l\'indexation.';
      setIndexStatus(message, 'error');
      return;
    }

    const count = Number.isFinite(data.indexed) ? data.indexed : 0;
    const sources = Number.isFinite(data.sources) ? data.sources : null;
    const suffix = sources !== null
      ? ` (${sources} fichier(s), ${count} fragment(s))`
      : count > 0
        ? ` (${count} document(s) indexé(s))`
        : '';
    setIndexStatus(`Indexation terminée${suffix}.`, 'success');
  } catch (error) {
    setIndexStatus('Erreur réseau lors de l\'indexation.', 'error');
  }
}

indexButton?.addEventListener('click', async () => {
  const selectedPath = selectedFolder?.value || '';

  if (!selectedPath) {
    setIndexStatus('Sélectionnez un dossier dans l’arborescence.', 'error');
    return;
  }

  await triggerIndex({ path: selectedPath });
});

indexAllButton?.addEventListener('click', async () => {
  await triggerIndex({ full: true });
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const action = form.getAttribute('action') || '/corpus/upload/universal';

  setStatus('Upload en cours...', 'info');

  try {
    const response = await fetch(action, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.error || 'Erreur lors de l\'upload.';
      setStatus(message, 'error');
      return;
    }

    const fileName = data?.file?.name || 'Fichier';
    setStatus(`${fileName} uploadé avec succès.`, 'success');
    form.reset();
    await loadFolderTree();
  } catch (error) {
    setStatus('Erreur réseau lors de l\'upload.', 'error');
  }
});

loadFolderTree();
