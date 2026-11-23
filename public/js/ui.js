// UI helper functions and safe DOM builder.
// Uses textContent strictly to prevent Cross-Site Scripting (XSS).

/**
 * Builds DOM elements safely.
 * @param {string} tag - HTML tag name (e.g. 'div', 'button', 'span')
 * @param {object} props - Attributes, properties, and event listeners
 * @param {Array|Node|string|number} children - Child elements or text
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, children = []) {
  const element = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null) continue;

      if (key.startsWith('on') && typeof value === 'function') {
        const eventName = key.slice(2).toLowerCase();
        element.addEventListener(eventName, value);
      } else if (key === 'className' || key === 'class') {
        element.className = value;
      } else if (key === 'textContent') {
        element.textContent = String(value);
      } else if (key === 'disabled') {
        element.disabled = Boolean(value);
      } else if (key === 'checked') {
        element.checked = Boolean(value);
      } else if (key === 'selected') {
        element.selected = Boolean(value);
      } else if (key === 'value') {
        element.value = value;
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }

  const childList = Array.isArray(children) ? children : [children];
  for (const child of childList) {
    if (child === undefined || child === null || child === false) continue;

    if (child instanceof Node) {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(String(child)));
    }
  }

  return element;
}

/**
 * Formats whole cents into currency string.
 * Example: 250000 -> "₦2,500"
 * @param {number} cents
 * @returns {string}
 */
export function formatPrice(cents) {
  if (typeof cents !== 'number' || Number.isNaN(cents)) return '₦0';
  if (cents === 0) return 'Free';
  const naira = Math.floor(cents / 100);
  return '₦' + naira.toLocaleString('en-US');
}

/**
 * Formats ISO date string into readable text.
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
