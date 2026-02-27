const $ = (selector) => {
  if (typeof selector === 'string') {
    if (selector.startsWith('<')) {
      const temp = document.createElement('div');
      temp.innerHTML = selector;
      return temp.firstChild;
    }
    return document.querySelector(selector);
  }
  return selector;
};

$.create = (tag, attrs = {}) => {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'class') el.className = val;
    else if (key === 'className') el.className = val;
    else if (key === 'text') el.textContent = val;
    else el.setAttribute(key, val);
  }
  return el;
};

$.append = (parent, child) => {
  if (Array.isArray(child)) {
    child.forEach(c => parent.appendChild(c));
  } else {
    parent.appendChild(child);
  }
  return parent;
};

$.on = (el, event, handler) => {
  el.addEventListener(event, handler);
  return el;
};

$.off = (el, event, handler) => {
  el.removeEventListener(event, handler);
  return el;
};

$.cookie = {
  get: (name) => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  },
  set: (name, value, days = 365) => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${value}; expires=${expires}; path=/`;
  }
};

module.exports = $;
