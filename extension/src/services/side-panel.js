/** 將 Chrome API 注入，讓測試不需要啟動瀏覽器。 */
export async function configureSidePanel(sidePanel) {
  await sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
