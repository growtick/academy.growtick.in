// Progressive JSON forms and buttons used across admin and learner pages.
//
//   <form data-api="/api/x" [data-redirect="/next"] [data-confirm="Sure?"] [data-keep]>
//     ... inputs; <output class="form-msg"></output> shows errors/success
//   </form>
//   <button data-api="/api/x" data-body='{"action":"y","id":"..."}' [data-confirm]>
//
// Fields: checkboxes → boolean, type=number → number, empty → null,
// data-json → JSON.parse. Response {redirect} navigates, {message} is shown;
// otherwise the page reloads unless data-keep is set.

type Json = Record<string, unknown>;

function serialize(form: HTMLFormElement): Json {
  const out: Json = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (!el.name || el.disabled) continue;
    if (el instanceof HTMLInputElement) {
      if (el.type === 'file' || el.type === 'submit' || el.type === 'button') continue;
      if (el.type === 'checkbox') {
        out[el.name] = el.checked;
        continue;
      }
      if (el.type === 'radio') {
        if (el.checked) out[el.name] = el.value;
        continue;
      }
      if (el.type === 'number') {
        out[el.name] = el.value === '' ? null : Number(el.value);
        continue;
      }
    }
    if (el.dataset.json !== undefined) {
      try {
        out[el.name] = el.value.trim() ? JSON.parse(el.value) : null;
      } catch {
        out[el.name] = el.value;
      }
      continue;
    }
    out[el.name] = el.value === '' ? null : el.value;
  }
  return out;
}

async function call(url: string, body: Json | FormData) {
  const init: RequestInit =
    body instanceof FormData
      ? { method: 'POST', body }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(url, init);
  let data: any = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || data.ok === false || data.error) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function msg(scope: Element, text: string, kind: 'error' | 'ok') {
  const box = scope.querySelector<HTMLElement>('.form-msg');
  if (box) {
    box.textContent = text;
    box.dataset.kind = kind;
  } else if (kind === 'error') {
    alert(text);
  }
}

function after(el: HTMLElement, data: any) {
  if (data.redirect) {
    location.href = data.redirect;
    return;
  }
  if (el.dataset.redirect) {
    location.href = el.dataset.redirect;
    return;
  }
  if (el.dataset.keep !== undefined) {
    msg(el, data.message || 'Saved.', 'ok');
    return;
  }
  location.reload();
}

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.api) return;
  e.preventDefault();
  if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
  const label = submit?.textContent;
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Working…';
  }
  msg(form, '', 'ok');
  try {
    const hasFile = !!form.querySelector('input[type="file"]');
    const data = await call(form.dataset.api, hasFile ? new FormData(form) : serialize(form));
    after(form, data);
  } catch (err) {
    msg(form, (err as Error).message, 'error');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = label ?? 'Save';
    }
  }
});

document.addEventListener('click', async (e) => {
  const btn = (e.target as Element | null)?.closest?.('button[data-api]');
  if (!(btn instanceof HTMLButtonElement)) return;
  e.preventDefault();
  if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const body = btn.dataset.body ? (JSON.parse(btn.dataset.body) as Json) : {};
    const data = await call(btn.dataset.api!, body);
    if (data.message && btn.dataset.keep !== undefined) alert(data.message);
    after(btn, data);
  } catch (err) {
    alert((err as Error).message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

// <select data-autosubmit> submits its (GET) form on change.
document.querySelectorAll<HTMLSelectElement>('select[data-autosubmit]').forEach((s) => {
  s.addEventListener('change', () => s.form?.submit());
});

// Client-side filter: <input data-filter="#list"> hides [data-row] children not matching.
document.querySelectorAll<HTMLInputElement>('input[data-filter]').forEach((input) => {
  const target = document.querySelector(input.dataset.filter!);
  if (!target) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    target.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
      row.hidden = !!q && !(row.dataset.row ?? row.textContent ?? '').toLowerCase().includes(q);
    });
  });
});
