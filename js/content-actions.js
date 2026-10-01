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

export async function downloadContent(item, audioUrl) {
  if (!item || !audioUrl) {
    showActionToast('Det finnes ingen lydfil å laste ned for dette innholdet.');
    return;
  }

  try {
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`Nedlasting svarte med ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Den hentede lydfilen er tom');

    const safeTitle = (item.title || item.name || 'tale')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .trim()
      .slice(0, 100) || 'tale';
    const extension = audioUrl.split(/[?#]/, 1)[0].match(/\.(mp3|m4a|m4b|aac|ogg|wav|mp4|webm)$/i)?.[1] || 'mp3';
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${safeTitle}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    showActionToast('Nedlastingen er startet.');
  } catch (error) {
    console.error('Kunne ikke laste ned lydfilen:', error);
    showActionToast('Nedlasting støttes ikke for denne lydkilden.');
  }
}