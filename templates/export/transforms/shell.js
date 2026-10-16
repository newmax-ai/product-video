// 在浏览器里对导出的克隆执行：root 是克隆出来的根节点，h 是 export_dom.mjs 提供的工具
// 这里放「按结构改」的演示数据：只留一问一答、改列表标题、换回复正文。按文字替换的放到配置的 replaceText。
(root, h) => {
  const msgs = [...root.querySelectorAll('[data-message-id]')];
  msgs.slice(2).forEach((m) => m.remove());
  const [user, reply] = msgs;
  if (user) h.textNodes(user).filter((n) => n.textContent.trim()).forEach((n, i) => { n.textContent = i === 0 ? '把这周的会议纪要整理成周报' : ''; });
  if (reply) reply.querySelector('.markdown')?.replaceChildren(Object.assign(document.createElement('p'), { textContent: '周报整理好了，按三个项目分组。' }));
  const titles = ['周报整理', '竞品定价调研', '发布会 PPT'];
  root.querySelectorAll('[data-conversation-row]').forEach((row, i) => {
    const n = h.textNodes(row).find((t) => t.textContent.trim());
    if (n && titles[i]) n.textContent = titles[i];
  });
}
