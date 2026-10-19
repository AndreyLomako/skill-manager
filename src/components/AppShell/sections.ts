// Разделы приложения. Переключатель в шапке появляется, когда разделов больше одного
// (следующим будет «Шаблоны» — своя механика, см. спецификацию каталога v2).
export const SECTIONS = [{ id: 'skills', title: 'Скиллы' }] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
