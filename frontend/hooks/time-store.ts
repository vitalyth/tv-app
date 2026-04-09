// time-store.ts

let nowSec = Math.floor(Date.now() / 1000);

const listeners = new Set<() => void>();

function emit() {
  nowSec = Math.floor(Date.now() / 1000);
  listeners.forEach((l) => l());
}

function startClock() {
  emit(); // first emit immediately, so components get the correct time on mount

  // calculate delay until the start of the next minute
  const delay = 60000 - (Date.now() % 60000);

  setTimeout(() => {
    emit(); // exactly at the start of the minute

    // from here — every minute
    setInterval(emit, 60000);
  }, delay);
}

startClock();

export function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSnapshot() {
  return nowSec;
}

export function getServerSnapshot() {
  return Math.floor(Date.now() / 1000);
}