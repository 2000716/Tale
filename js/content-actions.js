let toastTimeout;

export function showActionToast(message) {
  let toast = document.getElementById('action-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'action-toast';
    toast.className = 'action-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 3200);
}

export async function shareContent(item) {
  if (!item) return;

  const title = item.title || item.name || 'innhold på Tale';
  const url = window.location.href;
  const shareData = {
    title,
    text: `Hør på ${title} på Tale!`,
    url
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.warn('Kunne ikke åpne delingsmenyen:', error);
    }
  }

  const copyText = `${shareData.text} ${url}`;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Utklippstavle støttes ikke');
    await navigator.clipboard.writeText(copyText);
    showActionToast('Delingslenken er kopiert.');
  } catch {
    window.prompt('Kopier delingslenken:', copyText);
  }
}

