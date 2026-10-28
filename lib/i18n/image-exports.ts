import type { UiLanguage } from '@/lib/i18n';

type ImageExportCopy = {
  originals: string;
  framed: string;
  selectedOriginals: string;
  selectedFramed: string;
};

const COPY: Record<UiLanguage, ImageExportCopy> = {
  en: { originals: 'Original photos', framed: 'Framed photos', selectedOriginals: 'Download selected originals', selectedFramed: 'Download selected framed photos' },
  hu: { originals: 'Eredeti fotók', framed: 'Keretbe foglalt fotók', selectedOriginals: 'Kijelölt eredetik letöltése', selectedFramed: 'Kijelölt keretezett fotók letöltése' },
  de: { originals: 'Originalfotos', framed: 'Gerahmte Fotos', selectedOriginals: 'Ausgewählte Originale herunterladen', selectedFramed: 'Ausgewählte gerahmte Fotos herunterladen' },
  it: { originals: 'Foto originali', framed: 'Foto con cornice', selectedOriginals: 'Scarica gli originali selezionati', selectedFramed: 'Scarica le foto selezionate con cornice' },
  'pt-BR': { originals: 'Fotos originais', framed: 'Fotos com moldura', selectedOriginals: 'Baixar originais selecionadas', selectedFramed: 'Baixar fotos selecionadas com moldura' },
  'pt-PT': { originals: 'Fotografias originais', framed: 'Fotografias com moldura', selectedOriginals: 'Transferir originais selecionados', selectedFramed: 'Transferir fotografias selecionadas com moldura' },
  es: { originals: 'Fotos originales', framed: 'Fotos con marco', selectedOriginals: 'Descargar originales seleccionadas', selectedFramed: 'Descargar fotos seleccionadas con marco' },
  fr: { originals: 'Photos originales', framed: 'Photos encadrées', selectedOriginals: 'Télécharger les originaux sélectionnés', selectedFramed: 'Télécharger les photos encadrées sélectionnées' },
  ru: { originals: 'Оригинальные фото', framed: 'Фото в рамке', selectedOriginals: 'Скачать выбранные оригиналы', selectedFramed: 'Скачать выбранные фото в рамке' },
  'zh-Hans': { originals: '原始照片', framed: '带边框的照片', selectedOriginals: '下载所选原始照片', selectedFramed: '下载所选带边框的照片' },
  'zh-Hant': { originals: '原始照片', framed: '含相框的照片', selectedOriginals: '下載所選原始照片', selectedFramed: '下載所選含相框的照片' },
  ro: { originals: 'Fotografii originale', framed: 'Fotografii cu ramă', selectedOriginals: 'Descarcă originalele selectate', selectedFramed: 'Descarcă fotografiile selectate cu ramă' },
  pl: { originals: 'Oryginalne zdjęcia', framed: 'Zdjęcia w ramce', selectedOriginals: 'Pobierz wybrane oryginały', selectedFramed: 'Pobierz wybrane zdjęcia w ramce' },
  sk: { originals: 'Pôvodné fotografie', framed: 'Fotografie s rámom', selectedOriginals: 'Stiahnuť vybrané originály', selectedFramed: 'Stiahnuť vybrané fotografie s rámom' },
  hr: { originals: 'Izvorne fotografije', framed: 'Fotografije s okvirom', selectedOriginals: 'Preuzmi odabrane izvornike', selectedFramed: 'Preuzmi odabrane fotografije s okvirom' },
  sl: { originals: 'Izvirne fotografije', framed: 'Fotografije z okvirjem', selectedOriginals: 'Prenesi izbrane izvirnike', selectedFramed: 'Prenesi izbrane fotografije z okvirjem' },
  bg: { originals: 'Оригинални снимки', framed: 'Снимки с рамка', selectedOriginals: 'Изтегли избраните оригинали', selectedFramed: 'Изтегли избраните снимки с рамка' },
  tr: { originals: 'Orijinal fotoğraflar', framed: 'Çerçeveli fotoğraflar', selectedOriginals: 'Seçilen orijinalleri indir', selectedFramed: 'Seçilen çerçeveli fotoğrafları indir' },
  ar: { originals: 'الصور الأصلية', framed: 'الصور المؤطرة', selectedOriginals: 'تنزيل الصور الأصلية المحددة', selectedFramed: 'تنزيل الصور المؤطرة المحددة' },
  hi: { originals: 'मूल फ़ोटो', framed: 'फ़्रेम वाली फ़ोटो', selectedOriginals: 'चुनी हुई मूल फ़ोटो डाउनलोड करें', selectedFramed: 'चुनी हुई फ़्रेम वाली फ़ोटो डाउनलोड करें' },
  ka: { originals: 'ორიგინალი ფოტოები', framed: 'ჩარჩოიანი ფოტოები', selectedOriginals: 'არჩეული ორიგინალების ჩამოტვირთვა', selectedFramed: 'არჩეული ჩარჩოიანი ფოტოების ჩამოტვირთვა' },
  'sr-Cyrl': { originals: 'Оригиналне фотографије', framed: 'Фотографије са оквиром', selectedOriginals: 'Преузми изабране оригинале', selectedFramed: 'Преузми изабране фотографије са оквиром' },
  'sr-Latn': { originals: 'Originalne fotografije', framed: 'Fotografije sa okvirom', selectedOriginals: 'Preuzmi izabrane originale', selectedFramed: 'Preuzmi izabrane fotografije sa okvirom' },
};

export function imageExportText(key: keyof ImageExportCopy, language: UiLanguage): string {
  return COPY[language][key];
}
