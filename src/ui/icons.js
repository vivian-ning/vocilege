// src/ui/icons.js
//
// Dependency-free inline SVG icon helper. Icons are built with DOM APIs so the
// app keeps its no-innerHTML rendering rule.

const ICONS = {
  home: [
    ['path', { d: 'M3 11.5 12 4l9 7.5' }],
    ['path', { d: 'M5.5 10.5V20h13v-9.5' }],
    ['path', { d: 'M9.5 20v-6h5v6' }]
  ],
  chat: [
    ['path', { d: 'M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v4A3.5 3.5 0 0 1 15.5 14H11l-5 4v-4.2A3.5 3.5 0 0 1 5 11.5v-5Z' }]
  ],
  feed: [
    ['path', { d: 'M4 6.5h10' }],
    ['path', { d: 'M4 12h16' }],
    ['path', { d: 'M4 17.5h12' }],
    ['circle', { cx: 18, cy: 6.5, r: 1.5 }]
  ],
  settings: [
    ['path', { d: 'M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z' }],
    ['path', { d: 'M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66V21.3a2.1 2.1 0 0 1-4.2 0v-.05a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.66-1.1H2.9a2.1 2.1 0 0 1 0-4.2h.05A1.8 1.8 0 0 0 4.6 8a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.97-2.97l.04.04A1.8 1.8 0 0 0 9.2 3.4a1.8 1.8 0 0 0 1.1-1.66V1.7a2.1 2.1 0 0 1 4.2 0v.05a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04A1.8 1.8 0 0 0 19.4 8a1.8 1.8 0 0 0 1.66 1.1h.05a2.1 2.1 0 0 1 0 4.2h-.05A1.8 1.8 0 0 0 19.4 15Z' }]
  ],
  smile: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M8.5 10h.01' }],
    ['path', { d: 'M15.5 10h.01' }],
    ['path', { d: 'M8.5 14.5c1.7 1.5 5.3 1.5 7 0' }]
  ],
  image: [
    ['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }],
    ['circle', { cx: 8.5, cy: 10, r: 1.5 }],
    ['path', { d: 'm21 15-4.5-4.5L7 19' }]
  ],
  brain: [
    ['path', { d: 'M9 4.5A3.5 3.5 0 0 0 5.5 8v1A3.5 3.5 0 0 0 6 15.9V17a3 3 0 0 0 5 2.2V4.8A3.5 3.5 0 0 0 9 4.5Z' }],
    ['path', { d: 'M15 4.5A3.5 3.5 0 0 1 18.5 8v1a3.5 3.5 0 0 1-.5 6.9V17a3 3 0 0 1-5 2.2V4.8a3.5 3.5 0 0 1 2-.3Z' }],
    ['path', { d: 'M7.2 11.5h3.2' }],
    ['path', { d: 'M13.6 11.5h3.2' }]
  ],
  book: [
    ['path', { d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H7a3 3 0 0 0-3 3V5.5Z' }],
    ['path', { d: 'M4 19a3 3 0 0 1 3-3h13' }]
  ],
  user: [
    ['circle', { cx: 12, cy: 8, r: 4 }],
    ['path', { d: 'M4.5 21a7.5 7.5 0 0 1 15 0' }]
  ],
  ellipsis: [
    ['circle', { cx: 5, cy: 12, r: 1.25 }],
    ['circle', { cx: 12, cy: 12, r: 1.25 }],
    ['circle', { cx: 19, cy: 12, r: 1.25 }]
  ],
  send: [
    ['path', { d: 'M4 12 20 4l-5 16-3.2-6.8L4 12Z' }],
    ['path', { d: 'm12 13 8-9' }]
  ],
  x: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  chevron: [['path', { d: 'm8 10 4 4 4-4' }]],
  heart: [['path', { d: 'M20.8 8.6c0 5.1-8.8 10.4-8.8 10.4S3.2 13.7 3.2 8.6A4.6 4.6 0 0 1 12 6.5a4.6 4.6 0 0 1 8.8 2.1Z' }]],
  refresh: [['path', { d: 'M20 12a8 8 0 1 1-2.3-5.7' }], ['path', { d: 'M20 4v6h-6' }]],
  edit: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z' }]],
  left: [['path', { d: 'm15 18-6-6 6-6' }]],
  right: [['path', { d: 'm9 18 6-6-6-6' }]],
  plus: [['path', { d: 'M12 5v14' }], ['path', { d: 'M5 12h14' }]],
  trash: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M8 6V4h8v2' }],
    ['path', { d: 'M19 6l-1 14H6L5 6' }],
    ['path', { d: 'M10 11v5' }],
    ['path', { d: 'M14 11v5' }]
  ]
};

export function createIcon(name, { size = 20 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of (ICONS[name] || ICONS.ellipsis)) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    svg.appendChild(node);
  }
  return svg;
}

export function iconButton(name, label, { className = 'icon-btn', size = 20, title = label } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.setAttribute('aria-label', label);
  btn.title = title || label;
  btn.appendChild(createIcon(name, { size }));
  return btn;
}
