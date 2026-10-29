import { UI_LANGUAGES, type UiLanguage } from '@/lib/i18n';
import { adminExperienceTemplateText } from './admin-experience-templates';

/**
 * Short labels used by the shared admin navigation and account shell. Kept
 * separate from event-authored journey copy: these strings belong to the app.
 * Keep each locale complete; adminShellText falls back to English only for a
 * newly added key while its reviewed translation is being prepared.
 */
const ENGLISH = [
  'Overview', 'Events', 'Operations', 'Libraries', 'Settings', 'Access',
  'Dashboard', 'Vetting', 'Analytics', 'Global Frames', 'Generated Frames',
  'Global Logos', 'Sample selfies', 'Stadium backgrounds', 'QR texts', 'Global Images',
  'Landing Pages', 'Slideshows', 'Global Galleries', 'Journey defaults', 'Dictionary',
  'Frame slots', 'Activity log', 'Emails', 'Vetting words', 'Partners', 'Users',
  'Edit', 'Pages of the user journey', 'Photo analysis', 'Gallery', 'Logos', 'Frames',
  'Images', 'Texts', 'Pictures', 'Back to the main menu', 'Event', 'Partner',
  'Back to App', 'Return to Camera home', 'Logout', 'End your admin session',
  'Show admin tour', 'Admin Panel', 'No access', 'User', 'Admin', 'Superadmin',
] as const;

type AdminShellText = (typeof ENGLISH)[number];

// Ordered with ENGLISH above. Every list is checked against its key count so
// a missed item cannot silently shift all later labels into the wrong slots.
const VALUES: Record<UiLanguage, readonly string[]> = {
  en: ENGLISH,
  hu: ['Áttekintés','Események','Műveletek','Könyvtárak','Beállítások','Hozzáférés','Vezérlőpult','Ellenőrzés','Analitika','Globális keretek','Generált keretek','Globális logók','Mintaképek','Stadionháttérképek','QR-szövegek','Globális képek','Céloldalak','Diavetítések','Globális galériák','Útikalapértékek','Szótár','Kerethelyek','Tevékenységnapló','E-mailek','Ellenőrzési kifejezések','Partnerek','Felhasználók','Szerkesztés','A felhasználói útvonal oldalai','Fotóelemzés','Galéria','Logók','Keretek','Képek','Szövegek','Fotók','Vissza a főmenübe','Esemény','Partner','Vissza az alkalmazásba','Vissza a Camera főoldalára','Kijelentkezés','Admin-munkamenet lezárása','Admin útmutató megjelenítése','Adminfelület','Nincs hozzáférés','Felhasználó','Adminisztrátor','Főadminisztrátor'],
  de: ['Übersicht','Veranstaltungen','Betrieb','Bibliotheken','Einstellungen','Zugriff','Dashboard','Prüfung','Analysen','Globale Rahmen','Erstellte Rahmen','Globale Logos','Beispielfotos','Stadionhintergründe','QR-Texte','Globale Bilder','Landingpages','Diashows','Globale Galerien','Journey-Standards','Wörterbuch','Rahmenplätze','Aktivitätsprotokoll','E-Mails','Prüfbegriffe','Partner','Benutzer','Bearbeiten','Seiten der Nutzerreise','Fotoanalyse','Galerie','Logos','Rahmen','Bilder','Texte','Fotos','Zurück zum Hauptmenü','Veranstaltung','Partner','Zurück zur App','Zurück zur Camera-Startseite','Abmelden','Adminsitzung beenden','Admin-Tour anzeigen','Adminbereich','Kein Zugriff','Benutzer','Admin','Superadmin'],
  it: ['Panoramica','Eventi','Operazioni','Librerie','Impostazioni','Accesso','Dashboard','Verifica','Analisi','Cornici globali','Cornici generate','Loghi globali','Foto di esempio','Sfondi dello stadio','Testi QR','Immagini globali','Pagine di destinazione','Presentazioni','Gallerie globali','Impostazioni predefinite del percorso','Dizionario','Slot delle cornici','Registro attività','E-mail','Parole per la verifica','Partner','Utenti','Modifica','Pagine del percorso utente','Analisi delle foto','Galleria','Loghi','Cornici','Immagini','Testi','Foto','Torna al menu principale','Evento','Partner','Torna all’app','Torna alla home di Camera','Esci','Termina la sessione amministratore','Mostra la guida admin','Pannello di amministrazione','Nessun accesso','Utente','Amministratore','Superamministratore'],
  'pt-BR': ['Visão geral','Eventos','Operações','Bibliotecas','Configurações','Acesso','Painel','Verificação','Análises','Molduras globais','Molduras geradas','Logos globais','Fotos de exemplo','Fundos de estádio','Textos de QR','Imagens globais','Páginas de destino','Apresentações','Galerias globais','Padrões da jornada','Dicionário','Espaços de moldura','Registro de atividades','E-mails','Termos de verificação','Parceiros','Usuários','Editar','Páginas da jornada do usuário','Análise de fotos','Galeria','Logos','Molduras','Imagens','Textos','Fotos','Voltar ao menu principal','Evento','Parceiro','Voltar ao app','Voltar à página inicial da Camera','Sair','Encerrar sessão de administrador','Mostrar tour do administrador','Painel de administração','Sem acesso','Usuário','Administrador','Superadministrador'],
  'pt-PT': ['Visão geral','Eventos','Operações','Bibliotecas','Definições','Acesso','Painel','Verificação','Análises','Molduras globais','Molduras geradas','Logótipos globais','Fotografias de exemplo','Fundos de estádio','Textos QR','Imagens globais','Páginas de destino','Apresentações','Galerias globais','Predefinições da jornada','Dicionário','Espaços das molduras','Registo de atividade','E-mails','Termos de verificação','Parceiros','Utilizadores','Editar','Páginas da jornada do utilizador','Análise de fotografias','Galeria','Logótipos','Molduras','Imagens','Textos','Fotografias','Voltar ao menu principal','Evento','Parceiro','Voltar à aplicação','Voltar à página inicial da Camera','Terminar sessão','Terminar sessão de administração','Mostrar visita guiada do administrador','Painel de administração','Sem acesso','Utilizador','Administrador','Superadministrador'],
  es: ['Resumen','Eventos','Operaciones','Bibliotecas','Configuración','Acceso','Panel','Revisión','Analíticas','Marcos globales','Marcos generados','Logotipos globales','Fotos de ejemplo','Fondos del estadio','Textos QR','Imágenes globales','Páginas de destino','Presentaciones','Galerías globales','Valores predeterminados del recorrido','Diccionario','Espacios de marcos','Registro de actividad','Correos electrónicos','Términos de revisión','Socios','Usuarios','Editar','Páginas del recorrido del usuario','Análisis de fotos','Galería','Logotipos','Marcos','Imágenes','Textos','Fotos','Volver al menú principal','Evento','Socio','Volver a la aplicación','Volver al inicio de Camera','Cerrar sesión','Finalizar sesión de administración','Mostrar guía de administración','Panel de administración','Sin acceso','Usuario','Administrador','Superadministrador'],
  fr: ['Vue d’ensemble','Événements','Opérations','Bibliothèques','Paramètres','Accès','Tableau de bord','Vérification','Analyses','Cadres globaux','Cadres générés','Logos globaux','Photos d’exemple','Arrière-plans de stade','Textes QR','Images globales','Pages de destination','Diaporamas','Galeries globales','Paramètres du parcours','Dictionnaire','Emplacements des cadres','Journal d’activité','E-mails','Mots de vérification','Partenaires','Utilisateurs','Modifier','Pages du parcours utilisateur','Analyse des photos','Galerie','Logos','Cadres','Images','Textes','Photos','Retour au menu principal','Événement','Partenaire','Retour à l’application','Retour à l’accueil de Camera','Se déconnecter','Terminer la session admin','Afficher la visite guidée admin','Panneau d’administration','Aucun accès','Utilisateur','Administrateur','Superadministrateur'],
  ru: ['Обзор','События','Операции','Библиотеки','Настройки','Доступ','Панель управления','Проверка','Аналитика','Общие рамки','Созданные рамки','Общие логотипы','Примеры селфи','Фоны стадионов','QR-тексты','Общие изображения','Целевые страницы','Слайд-шоу','Общие галереи','Настройки сценария','Словарь','Слоты рамок','Журнал действий','Электронная почта','Слова проверки','Партнёры','Пользователи','Изменить','Страницы пути пользователя','Анализ фотографий','Галерея','Логотипы','Рамки','Изображения','Тексты','Фотографии','Назад в главное меню','Событие','Партнёр','Назад в приложение','На главную Camera','Выйти','Завершить сеанс администратора','Показать тур администратора','Панель администратора','Нет доступа','Пользователь','Администратор','Суперадминистратор'],
  'zh-Hans': ['概览','活动','运营','素材库','设置','访问权限','仪表板','审核','分析','全局相框','已生成相框','全局徽标','示例自拍','体育场背景','二维码文本','全局图片','落地页','幻灯片','全局图库','流程默认设置','词典','相框插槽','活动日志','电子邮件','审核词条','合作伙伴','用户','编辑','用户流程页面','照片分析','图库','徽标','相框','图片','文本','照片','返回主菜单','活动','合作伙伴','返回应用','返回 Camera 首页','退出登录','结束管理员会话','显示管理员导览','管理面板','无权访问','用户','管理员','超级管理员'],
  'zh-Hant': ['總覽','活動','營運','素材庫','設定','存取權限','儀表板','審核','分析','全域相框','已產生相框','全域標誌','範例自拍','體育場背景','QR 文字','全域圖片','登陸頁面','投影片','全域圖庫','流程預設值','字典','相框插槽','活動記錄','電子郵件','審核詞彙','合作夥伴','使用者','編輯','使用者流程頁面','照片分析','圖庫','標誌','相框','圖片','文字','照片','返回主選單','活動','合作夥伴','返回應用程式','返回 Camera 首頁','登出','結束管理員工作階段','顯示管理員導覽','管理面板','沒有存取權','使用者','管理員','超級管理員'],
  ro: ['Prezentare generală','Evenimente','Operațiuni','Biblioteci','Setări','Acces','Panou de control','Verificare','Analize','Rame globale','Rame generate','Sigle globale','Selfie-uri demonstrative','Fundaluri de stadion','Texte QR','Imagini globale','Pagini de destinație','Diapozitive','Galerii globale','Valori implicite ale fluxului','Dicționar','Sloturi pentru rame','Jurnal de activitate','E-mailuri','Termeni de verificare','Parteneri','Utilizatori','Editează','Pagini ale parcursului utilizatorului','Analiza fotografiilor','Galerie','Sigle','Rame','Imagini','Texte','Fotografii','Înapoi la meniul principal','Eveniment','Partener','Înapoi la aplicație','Înapoi la pagina principală Camera','Deconectare','Încheie sesiunea de administrator','Afișează turul administratorului','Panou de administrare','Fără acces','Utilizator','Administrator','Superadministrator'],
  pl: ['Przegląd','Wydarzenia','Operacje','Biblioteki','Ustawienia','Dostęp','Panel','Weryfikacja','Analityka','Globalne ramki','Wygenerowane ramki','Globalne logotypy','Przykładowe selfie','Tła stadionów','Teksty QR','Globalne obrazy','Strony docelowe','Pokazy slajdów','Globalne galerie','Domyślne ustawienia ścieżki','Słownik','Miejsca ramek','Dziennik aktywności','E-maile','Słowa weryfikacji','Partnerzy','Użytkownicy','Edytuj','Strony ścieżki użytkownika','Analiza zdjęć','Galeria','Logotypy','Ramki','Obrazy','Teksty','Zdjęcia','Wróć do menu głównego','Wydarzenie','Partner','Wróć do aplikacji','Wróć do strony głównej Camera','Wyloguj','Zakończ sesję administratora','Pokaż przewodnik administratora','Panel administracyjny','Brak dostępu','Użytkownik','Administrator','Superadministrator'],
  sk: ['Prehľad','Podujatia','Prevádzka','Knižnice','Nastavenia','Prístup','Nástenka','Kontrola','Analytika','Globálne rámy','Vygenerované rámy','Globálne logá','Ukážkové selfie','Pozadia štadióna','QR texty','Globálne obrázky','Vstupné stránky','Prezentácie','Globálne galérie','Predvolené nastavenia postupu','Slovník','Pozície rámov','Záznam aktivít','E-maily','Kontrolné slová','Partneri','Používatelia','Upraviť','Stránky používateľského postupu','Analýza fotografií','Galéria','Logá','Rámy','Obrázky','Texty','Fotografie','Späť do hlavnej ponuky','Podujatie','Partner','Späť do aplikácie','Späť na domovskú stránku Camera','Odhlásiť sa','Ukončiť reláciu správcu','Zobraziť sprievodcu správcu','Panel správcu','Bez prístupu','Používateľ','Správca','Super správca'],
  hr: ['Pregled','Događaji','Operacije','Knjižnice','Postavke','Pristup','Nadzorna ploča','Provjera','Analitika','Globalni okviri','Generirani okviri','Globalni logotipi','Primjeri selfija','Pozadine stadiona','QR tekstovi','Globalne slike','Odredišne stranice','Dijaprojekcije','Globalne galerije','Zadane postavke tijeka','Rječnik','Mjesta okvira','Zapis aktivnosti','E-pošta','Pojmovi provjere','Partneri','Korisnici','Uredi','Stranice korisničkog tijeka','Analiza fotografija','Galerija','Logotipi','Okviri','Slike','Tekstovi','Fotografije','Natrag na glavni izbornik','Događaj','Partner','Natrag u aplikaciju','Natrag na početnu stranicu Camera','Odjava','Završi administratorsku sesiju','Prikaži administratorski vodič','Administratorska ploča','Nema pristupa','Korisnik','Administrator','Superadministrator'],
  sl: ['Pregled','Dogodki','Operacije','Knjižnice','Nastavitve','Dostop','Nadzorna plošča','Pregled','Analitika','Globalni okvirji','Ustvarjeni okvirji','Globalni logotipi','Vzorčni selfiji','Ozadja stadionov','Besedila QR','Globalne slike','Ciljne strani','Diaprojekcije','Globalne galerije','Privzete nastavitve poteka','Slovar','Mesta okvirjev','Dnevnik dejavnosti','E-pošta','Besede za pregled','Partnerji','Uporabniki','Uredi','Strani uporabniške poti','Analiza fotografij','Galerija','Logotipi','Okvirji','Slike','Besedila','Fotografije','Nazaj v glavni meni','Dogodek','Partner','Nazaj v aplikacijo','Nazaj na domačo stran Camera','Odjava','Končaj skrbniško sejo','Prikaži skrbniški vodič','Skrbniška plošča','Brez dostopa','Uporabnik','Skrbnik','Super skrbnik'],
  bg: ['Общ преглед','Събития','Операции','Библиотеки','Настройки','Достъп','Табло','Проверка','Анализ','Глобални рамки','Генерирани рамки','Глобални лога','Примерни селфита','Фонове на стадиони','QR текстове','Глобални изображения','Целеви страници','Слайдшоута','Глобални галерии','Настройки по подразбиране','Речник','Позиции за рамки','Дневник на дейностите','Имейли','Думи за проверка','Партньори','Потребители','Редактиране','Страници от пътя на потребителя','Анализ на снимки','Галерия','Лога','Рамки','Изображения','Текстове','Снимки','Назад към главното меню','Събитие','Партньор','Назад към приложението','Към началната страница на Camera','Изход','Край на администраторската сесия','Покажи администраторския тур','Административен панел','Няма достъп','Потребител','Администратор','Суперадминистратор'],
  tr: ['Genel bakış','Etkinlikler','Operasyonlar','Kütüphaneler','Ayarlar','Erişim','Kontrol paneli','İnceleme','Analizler','Genel çerçeveler','Oluşturulan çerçeveler','Genel logolar','Örnek selfieler','Stadyum arka planları','QR metinleri','Genel görseller','Açılış sayfaları','Slayt gösterileri','Genel galeriler','Yolculuk varsayılanları','Sözlük','Çerçeve yuvaları','Etkinlik günlüğü','E-postalar','İnceleme sözcükleri','İş ortakları','Kullanıcılar','Düzenle','Kullanıcı yolculuğu sayfaları','Fotoğraf analizi','Galeri','Logolar','Çerçeveler','Görseller','Metinler','Fotoğraflar','Ana menüye dön','Etkinlik','İş ortağı','Uygulamaya dön','Camera ana sayfasına dön','Çıkış yap','Yönetici oturumunu bitir','Yönetici turunu göster','Yönetici paneli','Erişim yok','Kullanıcı','Yönetici','Süper yönetici'],
  ar: ['نظرة عامة','الفعاليات','العمليات','المكتبات','الإعدادات','الوصول','لوحة المعلومات','المراجعة','التحليلات','إطارات عامة','إطارات مُنشأة','شعارات عامة','صور سيلفي نموذجية','خلفيات الملاعب','نصوص QR','صور عامة','صفحات الهبوط','عروض الشرائح','معارض عامة','الإعدادات الافتراضية للرحلة','القاموس','مواضع الإطارات','سجل النشاط','البريد الإلكتروني','كلمات المراجعة','الشركاء','المستخدمون','تعديل','صفحات رحلة المستخدم','تحليل الصور','المعرض','الشعارات','الإطارات','الصور','النصوص','الصور الفوتوغرافية','العودة إلى القائمة الرئيسية','فعالية','شريك','العودة إلى التطبيق','العودة إلى الصفحة الرئيسية في Camera','تسجيل الخروج','إنهاء جلسة المسؤول','عرض جولة المسؤول','لوحة الإدارة','لا يوجد وصول','مستخدم','مسؤول','مسؤول عام'],
  hi: ['अवलोकन','कार्यक्रम','संचालन','लाइब्रेरी','सेटिंग्स','पहुँच','डैशबोर्ड','समीक्षा','विश्लेषण','वैश्विक फ़्रेम','बनाए गए फ़्रेम','वैश्विक लोगो','नमूना सेल्फ़ी','स्टेडियम पृष्ठभूमि','QR टेक्स्ट','वैश्विक छवियाँ','लैंडिंग पेज','स्लाइडशो','वैश्विक गैलरी','यात्रा के डिफ़ॉल्ट','शब्दकोश','फ़्रेम स्लॉट','गतिविधि लॉग','ईमेल','समीक्षा शब्द','भागीदार','उपयोगकर्ता','संपादित करें','उपयोगकर्ता यात्रा के पृष्ठ','फ़ोटो विश्लेषण','गैलरी','लोगो','फ़्रेम','छवियाँ','टेक्स्ट','फ़ोटो','मुख्य मेनू पर वापस जाएँ','कार्यक्रम','भागीदार','ऐप पर वापस जाएँ','Camera होम पर वापस जाएँ','लॉग आउट','व्यवस्थापक सत्र समाप्त करें','व्यवस्थापक टूर दिखाएँ','व्यवस्थापक पैनल','पहुँच नहीं','उपयोगकर्ता','व्यवस्थापक','सुपर व्यवस्थापक'],
  ka: ['მიმოხილვა','ღონისძიებები','ოპერაციები','ბიბლიოთეკები','პარამეტრები','წვდომა','მთავარი პანელი','შემოწმება','ანალიტიკა','გლობალური ჩარჩოები','შექმნილი ჩარჩოები','გლობალური ლოგოები','სატესტო სელფები','სტადიონის ფონები','QR ტექსტები','გლობალური სურათები','სადესანტო გვერდები','სლაიდშოუები','გლობალური გალერეები','ნაგულისხმევი ნაბიჯები','ლექსიკონი','ჩარჩოს სლოტები','აქტივობის ჟურნალი','ელფოსტა','შემოწმების სიტყვები','პარტნიორები','მომხმარებლები','რედაქტირება','მომხმარებლის გზის გვერდები','ფოტოების ანალიზი','გალერეა','ლოგოები','ჩარჩოები','სურათები','ტექსტები','ფოტოები','მთავარ მენიუში დაბრუნება','ღონისძიება','პარტნიორი','აპში დაბრუნება','Camera-ის მთავარ გვერდზე დაბრუნება','გასვლა','ადმინისტრატორის სესიის დასრულება','ადმინისტრატორის ტურის ჩვენება','ადმინისტრირების პანელი','წვდომა არ არის','მომხმარებელი','ადმინისტრატორი','სუპერადმინისტრატორი'],
  'sr-Cyrl': ['Преглед','Догађаји','Операције','Библиотеке','Подешавања','Приступ','Контролна табла','Провера','Аналитика','Глобални оквири','Генерисани оквири','Глобални логотипи','Пример селфији','Позадине стадиона','QR текстови','Глобалне слике','Одредишне странице','Слајдшоуи','Глобалне галерије','Подразумеване поставке тока','Речник','Места оквира','Дневник активности','Имејлови','Речи за проверу','Партнери','Корисници','Измени','Странице корисничког тока','Анализа фотографија','Галерија','Логотипи','Оквири','Слике','Текстови','Фотографије','Назад на главни мени','Догађај','Партнер','Назад у апликацију','Назад на почетну страницу Camera','Одјави се','Заврши администраторску сесију','Прикажи администраторски водич','Администраторски панел','Нема приступа','Корисник','Администратор','Суперадминистратор'],
  'sr-Latn': ['Pregled','Događaji','Operacije','Biblioteke','Podešavanja','Pristup','Kontrolna tabla','Provera','Analitika','Globalni okviri','Generisani okviri','Globalni logotipi','Primer selfiji','Pozadine stadiona','QR tekstovi','Globalne slike','Odredišne stranice','Slajdšoui','Globalne galerije','Podrazumevane postavke toka','Rečnik','Mesta okvira','Dnevnik aktivnosti','Imejlovi','Reči za proveru','Partneri','Korisnici','Izmeni','Stranice korisničkog toka','Analiza fotografija','Galerija','Logotipi','Okviri','Slike','Tekstovi','Fotografije','Nazad na glavni meni','Događaj','Partner','Nazad u aplikaciju','Nazad na početnu stranicu Camera','Odjavi se','Završi administratorsku sesiju','Prikaži administratorski vodič','Administratorski panel','Nema pristupa','Korisnik','Administrator','Superadministrator'],
};

const MAP: Record<UiLanguage, Record<AdminShellText, string>> = Object.fromEntries(
  UI_LANGUAGES.map((language) => {
    const values = VALUES[language];
    if (values.length !== ENGLISH.length) throw new Error(`Incomplete admin shell translations for ${language}`);
    return [language, Object.fromEntries(ENGLISH.map((text, index) => [text, values[index]]))];
  }),
) as Record<UiLanguage, Record<AdminShellText, string>>;

/** New information-architecture group names, translated for every admin locale. */
const NAV_GROUP_LABELS: Record<UiLanguage, Record<'Org' | 'Blocks' | 'Content', string>> = {
  en: { Org: 'Org', Blocks: 'Blocks', Content: 'Content' },
  hu: { Org: 'Szervezet', Blocks: 'Építőelemek', Content: 'Tartalom' },
  de: { Org: 'Organisation', Blocks: 'Bausteine', Content: 'Inhalte' },
  it: { Org: 'Organizzazione', Blocks: 'Elementi', Content: 'Contenuti' },
  'pt-BR': { Org: 'Organização', Blocks: 'Blocos', Content: 'Conteúdo' },
  'pt-PT': { Org: 'Organização', Blocks: 'Blocos', Content: 'Conteúdo' },
  es: { Org: 'Organización', Blocks: 'Bloques', Content: 'Contenido' },
  fr: { Org: 'Organisation', Blocks: 'Éléments', Content: 'Contenu' },
  ru: { Org: 'Организация', Blocks: 'Блоки', Content: 'Контент' },
  'zh-Hans': { Org: '组织', Blocks: '模块', Content: '内容' },
  'zh-Hant': { Org: '組織', Blocks: '區塊', Content: '內容' },
  ro: { Org: 'Organizație', Blocks: 'Blocuri', Content: 'Conținut' },
  pl: { Org: 'Organizacja', Blocks: 'Bloki', Content: 'Treść' },
  sk: { Org: 'Organizácia', Blocks: 'Bloky', Content: 'Obsah' },
  hr: { Org: 'Organizacija', Blocks: 'Blokovi', Content: 'Sadržaj' },
  sl: { Org: 'Organizacija', Blocks: 'Bloki', Content: 'Vsebina' },
  bg: { Org: 'Организация', Blocks: 'Блокове', Content: 'Съдържание' },
  tr: { Org: 'Organizasyon', Blocks: 'Bloklar', Content: 'İçerik' },
  ar: { Org: 'المؤسسة', Blocks: 'الكتل', Content: 'المحتوى' },
  hi: { Org: 'संगठन', Blocks: 'ब्लॉक', Content: 'सामग्री' },
  ka: { Org: 'ორგანიზაცია', Blocks: 'ბლოკები', Content: 'შიგთავსი' },
  'sr-Cyrl': { Org: 'Организација', Blocks: 'Блокови', Content: 'Садржај' },
  'sr-Latn': { Org: 'Organizacija', Blocks: 'Blokovi', Content: 'Sadržaj' },
};

/** Small labels added by the shared service/settings navigation. */
const NAV_ITEM_LABELS: Record<UiLanguage, Record<string, string>> = {
  en: { Service: 'Service', 'Experience defaults': 'Experience defaults' },
  hu: { Service: 'Szolgáltatás', 'Experience defaults': 'Élménybeállítások' },
  de: { Service: 'Service', 'Experience defaults': 'Erlebnisvorgaben' },
  it: { Service: 'Servizio', 'Experience defaults': 'Impostazioni esperienza' },
  'pt-BR': { Service: 'Serviço', 'Experience defaults': 'Padrões da experiência' },
  'pt-PT': { Service: 'Serviço', 'Experience defaults': 'Predefinições da experiência' },
  es: { Service: 'Servicio', 'Experience defaults': 'Configuración de experiencia' },
  fr: { Service: 'Service', 'Experience defaults': 'Paramètres de l’expérience' },
  ru: { Service: 'Сервис', 'Experience defaults': 'Настройки опыта' },
  'zh-Hans': { Service: '服务', 'Experience defaults': '体验默认设置' },
  'zh-Hant': { Service: '服務', 'Experience defaults': '體驗預設設定' },
  ro: { Service: 'Serviciu', 'Experience defaults': 'Setări prestabilite ale experienței' },
  pl: { Service: 'Serwis', 'Experience defaults': 'Domyślne ustawienia doświadczenia' },
  sk: { Service: 'Servis', 'Experience defaults': 'Predvolené nastavenia zážitku' },
  hr: { Service: 'Servis', 'Experience defaults': 'Zadane postavke iskustva' },
  sl: { Service: 'Storitev', 'Experience defaults': 'Privzete nastavitve izkušnje' },
  bg: { Service: 'Сервиз', 'Experience defaults': 'Настройки по подразбиране на изживяването' },
  tr: { Service: 'Hizmet', 'Experience defaults': 'Deneyim varsayılanları' },
  ar: { Service: 'الخدمة', 'Experience defaults': 'الإعدادات الافتراضية للتجربة' },
  hi: { Service: 'सेवा', 'Experience defaults': 'अनुभव के डिफ़ॉल्ट' },
  ka: { Service: 'სერვისი', 'Experience defaults': 'გამოცდილების ნაგულისხმევი პარამეტრები' },
  'sr-Cyrl': { Service: 'Сервис', 'Experience defaults': 'Подразумевана подешавања доживљаја' },
  'sr-Latn': { Service: 'Servis', 'Experience defaults': 'Podrazumevana podešavanja doživljaja' },
};

/** Scoped journey and email destinations in the global, partner and event menus. */
const SCOPED_NAV_LABELS: Record<UiLanguage, Record<string, string>> = {
  en: { 'Global User Journey': 'Global User Journey', 'Partner User Journey': 'Partner User Journey', 'Event User Journey': 'Event User Journey', 'Global Email': 'Global Email', 'Partner Email': 'Partner Email', 'Event Email': 'Event Email', 'Generated Frame Rollout': 'Generated Frame Rollout' },
  hu: { 'Global User Journey': 'Globális felhasználói útvonal', 'Partner User Journey': 'Partner felhasználói útvonal', 'Event User Journey': 'Esemény felhasználói útvonala', 'Global Email': 'Globális e-mail', 'Partner Email': 'Partner e-mail', 'Event Email': 'Esemény e-mail', 'Generated Frame Rollout': 'Generált keretek kiosztása' },
  de: { 'Global User Journey': 'Globale Nutzerreise', 'Partner User Journey': 'Partner-Nutzerreise', 'Event User Journey': 'Event-Nutzerreise', 'Global Email': 'Globale E-Mail', 'Partner Email': 'Partner-E-Mail', 'Event Email': 'Event-E-Mail', 'Generated Frame Rollout': 'Rollout generierter Rahmen' },
  it: { 'Global User Journey': 'Percorso utente globale', 'Partner User Journey': 'Percorso utente del partner', 'Event User Journey': 'Percorso utente dell’evento', 'Global Email': 'E-mail globali', 'Partner Email': 'E-mail del partner', 'Event Email': 'E-mail dell’evento', 'Generated Frame Rollout': 'Distribuzione delle cornici generate' },
  'pt-BR': { 'Global User Journey': 'Jornada global do usuário', 'Partner User Journey': 'Jornada do usuário do parceiro', 'Event User Journey': 'Jornada do usuário do evento', 'Global Email': 'E-mail global', 'Partner Email': 'E-mail do parceiro', 'Event Email': 'E-mail do evento', 'Generated Frame Rollout': 'Aplicação de molduras geradas' },
  'pt-PT': { 'Global User Journey': 'Percurso global do utilizador', 'Partner User Journey': 'Percurso do utilizador do parceiro', 'Event User Journey': 'Percurso do utilizador do evento', 'Global Email': 'E-mail global', 'Partner Email': 'E-mail do parceiro', 'Event Email': 'E-mail do evento', 'Generated Frame Rollout': 'Aplicação de molduras geradas' },
  es: { 'Global User Journey': 'Recorrido global del usuario', 'Partner User Journey': 'Recorrido del usuario del socio', 'Event User Journey': 'Recorrido del usuario del evento', 'Global Email': 'Correo global', 'Partner Email': 'Correo del socio', 'Event Email': 'Correo del evento', 'Generated Frame Rollout': 'Despliegue de marcos generados' },
  fr: { 'Global User Journey': 'Parcours utilisateur global', 'Partner User Journey': 'Parcours utilisateur du partenaire', 'Event User Journey': 'Parcours utilisateur de l’événement', 'Global Email': 'E-mail global', 'Partner Email': 'E-mail du partenaire', 'Event Email': 'E-mail de l’événement', 'Generated Frame Rollout': 'Déploiement des cadres générés' },
  ru: { 'Global User Journey': 'Глобальный путь пользователя', 'Partner User Journey': 'Путь пользователя партнёра', 'Event User Journey': 'Путь пользователя события', 'Global Email': 'Общая почта', 'Partner Email': 'Почта партнёра', 'Event Email': 'Почта события', 'Generated Frame Rollout': 'Развёртывание созданных рамок' },
  'zh-Hans': { 'Global User Journey': '全局用户流程', 'Partner User Journey': '合作伙伴用户流程', 'Event User Journey': '活动用户流程', 'Global Email': '全局邮件', 'Partner Email': '合作伙伴邮件', 'Event Email': '活动邮件', 'Generated Frame Rollout': '生成相框部署' },
  'zh-Hant': { 'Global User Journey': '全域使用者流程', 'Partner User Journey': '合作夥伴使用者流程', 'Event User Journey': '活動使用者流程', 'Global Email': '全域電子郵件', 'Partner Email': '合作夥伴電子郵件', 'Event Email': '活動電子郵件', 'Generated Frame Rollout': '產生相框部署' },
  ro: { 'Global User Journey': 'Parcurs global al utilizatorului', 'Partner User Journey': 'Parcursul utilizatorului partenerului', 'Event User Journey': 'Parcursul utilizatorului la eveniment', 'Global Email': 'E-mail global', 'Partner Email': 'E-mailul partenerului', 'Event Email': 'E-mailul evenimentului', 'Generated Frame Rollout': 'Implementarea ramelor generate' },
  pl: { 'Global User Journey': 'Globalna ścieżka użytkownika', 'Partner User Journey': 'Ścieżka użytkownika partnera', 'Event User Journey': 'Ścieżka użytkownika wydarzenia', 'Global Email': 'E-mail globalny', 'Partner Email': 'E-mail partnera', 'Event Email': 'E-mail wydarzenia', 'Generated Frame Rollout': 'Wdrożenie wygenerowanych ramek' },
  sk: { 'Global User Journey': 'Globálna používateľská cesta', 'Partner User Journey': 'Používateľská cesta partnera', 'Event User Journey': 'Používateľská cesta podujatia', 'Global Email': 'Globálny e-mail', 'Partner Email': 'E-mail partnera', 'Event Email': 'E-mail podujatia', 'Generated Frame Rollout': 'Nasadenie vytvorených rámov' },
  hr: { 'Global User Journey': 'Globalni korisnički tijek', 'Partner User Journey': 'Korisnički tijek partnera', 'Event User Journey': 'Korisnički tijek događaja', 'Global Email': 'Globalna e-pošta', 'Partner Email': 'E-pošta partnera', 'Event Email': 'E-pošta događaja', 'Generated Frame Rollout': 'Uvođenje generiranih okvira' },
  sl: { 'Global User Journey': 'Globalna uporabniška pot', 'Partner User Journey': 'Uporabniška pot partnerja', 'Event User Journey': 'Uporabniška pot dogodka', 'Global Email': 'Globalna e-pošta', 'Partner Email': 'E-pošta partnerja', 'Event Email': 'E-pošta dogodka', 'Generated Frame Rollout': 'Uvedba ustvarjenih okvirjev' },
  bg: { 'Global User Journey': 'Глобален потребителски път', 'Partner User Journey': 'Потребителски път на партньора', 'Event User Journey': 'Потребителски път на събитието', 'Global Email': 'Глобален имейл', 'Partner Email': 'Имейл на партньора', 'Event Email': 'Имейл на събитието', 'Generated Frame Rollout': 'Внедряване на генерирани рамки' },
  tr: { 'Global User Journey': 'Genel kullanıcı yolculuğu', 'Partner User Journey': 'İş ortağı kullanıcı yolculuğu', 'Event User Journey': 'Etkinlik kullanıcı yolculuğu', 'Global Email': 'Genel e-posta', 'Partner Email': 'İş ortağı e-postası', 'Event Email': 'Etkinlik e-postası', 'Generated Frame Rollout': 'Oluşturulan çerçevelerin dağıtımı' },
  ar: { 'Global User Journey': 'رحلة المستخدم العامة', 'Partner User Journey': 'رحلة مستخدم الشريك', 'Event User Journey': 'رحلة مستخدم الفعالية', 'Global Email': 'البريد الإلكتروني العام', 'Partner Email': 'بريد الشريك الإلكتروني', 'Event Email': 'بريد الفعالية الإلكتروني', 'Generated Frame Rollout': 'تطبيق الإطارات المُنشأة' },
  hi: { 'Global User Journey': 'वैश्विक उपयोगकर्ता यात्रा', 'Partner User Journey': 'भागीदार उपयोगकर्ता यात्रा', 'Event User Journey': 'कार्यक्रम उपयोगकर्ता यात्रा', 'Global Email': 'वैश्विक ईमेल', 'Partner Email': 'भागीदार ईमेल', 'Event Email': 'कार्यक्रम ईमेल', 'Generated Frame Rollout': 'बनाए गए फ़्रेम लागू करना' },
  ka: { 'Global User Journey': 'მომხმარებლის გლობალური გზა', 'Partner User Journey': 'პარტნიორის მომხმარებლის გზა', 'Event User Journey': 'ღონისძიების მომხმარებლის გზა', 'Global Email': 'გლობალური ელფოსტა', 'Partner Email': 'პარტნიორის ელფოსტა', 'Event Email': 'ღონისძიების ელფოსტა', 'Generated Frame Rollout': 'შექმნილი ჩარჩოების დანერგვა' },
  'sr-Cyrl': { 'Global User Journey': 'Глобални кориснички ток', 'Partner User Journey': 'Кориснички ток партнера', 'Event User Journey': 'Кориснички ток догађаја', 'Global Email': 'Глобални имејл', 'Partner Email': 'Имејл партнера', 'Event Email': 'Имејл догађаја', 'Generated Frame Rollout': 'Увођење генерисаних оквира' },
  'sr-Latn': { 'Global User Journey': 'Globalni korisnički tok', 'Partner User Journey': 'Korisnički tok partnera', 'Event User Journey': 'Korisnički tok događaja', 'Global Email': 'Globalni imejl', 'Partner Email': 'Imejl partnera', 'Event Email': 'Imejl događaja', 'Generated Frame Rollout': 'Uvođenje generisanih okvira' },
};

/** Scoped global entries reuse the reviewed wording already used by their editors. */
const GLOBAL_NAV_LABEL_BASE: Record<string, AdminShellText> = {
  'Global Dictionary': 'Dictionary',
  'Global Frame Slots': 'Frame slots',
  'Global Selfies': 'Sample selfies',
  'Global Stadiums': 'Stadium backgrounds',
  'Global Vetting words': 'Vetting words',
  'Global Landing Pages': 'Landing Pages',
  'Global Slideshows': 'Slideshows',
};

/** Event setup's composition review and live-journey notice. */
const EVENT_EXPERIENCE_TEXT: Record<UiLanguage, Record<string, string>> = {
  en: {
    'Preview and test': 'Preview and test',
    'Open the live guest journey': 'Open the live guest journey',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.',
  },
  hu: {
    'Preview and test': 'Előnézet és teszt',
    'Open the live guest journey': 'Élő felhasználói folyamat megnyitása',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Éles esemény: az itt beküldött szelfik valódi eseménybeküldések. Az esemény hozzájárulási, ellenőrzési, közzétételi, e-mail- és analitikai beállításai vonatkoznak rájuk.',
  },
  de: {
    'Preview and test': 'Vorschau und testen',
    'Open the live guest journey': 'Live-Gästestrecke öffnen',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Live-Event: Hier eingereichte Selfies sind echte Event-Einsendungen. Es gelten die Einwilligungs-, Prüf-, Veröffentlichungs-, E-Mail- und Analyse-Einstellungen dieses Events.',
  },
  it: {
    'Preview and test': 'Anteprima e test',
    'Open the live guest journey': 'Apri il percorso ospite attivo',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Evento attivo: i selfie inviati qui sono contributi reali. Seguono le impostazioni dell’evento per consenso, verifica, pubblicazione, e-mail e analisi.',
  },
  'pt-BR': {
    'Preview and test': 'Visualizar e testar',
    'Open the live guest journey': 'Abrir a jornada real do participante',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Evento ativo: as selfies enviadas aqui são envios reais. Elas seguem as configurações de consentimento, análise, publicação, e-mail e métricas deste evento.',
  },
  'pt-PT': {
    'Preview and test': 'Pré-visualizar e testar',
    'Open the live guest journey': 'Abrir o percurso real do participante',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Evento ativo: as selfies enviadas aqui são submissões reais. Seguem as definições de consentimento, revisão, publicação, e-mail e análise deste evento.',
  },
  es: {
    'Preview and test': 'Vista previa y prueba',
    'Open the live guest journey': 'Abrir el recorrido real del participante',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Evento en directo: los selfies enviados aquí son envíos reales. Siguen la configuración de consentimiento, revisión, publicación, correo y análisis del evento.',
  },
  fr: {
    'Preview and test': 'Prévisualiser et tester',
    'Open the live guest journey': 'Ouvrir le parcours réel du participant',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Événement en direct : les selfies envoyés ici sont de vraies soumissions. Ils suivent les paramètres de consentement, de vérification, de publication, d’e-mail et d’analyse de cet événement.',
  },
  ru: {
    'Preview and test': 'Предпросмотр и тестирование',
    'Open the live guest journey': 'Открыть реальный путь участника',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Текущее событие: отправленные здесь селфи являются настоящими заявками. Для них действуют настройки согласия, проверки, публикации, электронной почты и аналитики этого события.',
  },
  'zh-Hans': {
    'Preview and test': '预览和测试',
    'Open the live guest journey': '打开实际用户流程',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': '当前活动：在此提交的自拍会作为真实活动照片保存，并遵循此活动的同意、审核、发布、邮件和分析设置。',
  },
  'zh-Hant': {
    'Preview and test': '預覽與測試',
    'Open the live guest journey': '開啟實際使用者流程',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': '目前活動：在此提交的自拍會作為真實活動照片儲存，並遵循此活動的同意、審核、發布、電子郵件與分析設定。',
  },
  ro: {
    'Preview and test': 'Previzualizare și testare',
    'Open the live guest journey': 'Deschide fluxul real al participantului',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Eveniment activ: selfie-urile trimise aici sunt înscrieri reale. Se aplică setările evenimentului pentru consimțământ, verificare, publicare, e-mail și analiză.',
  },
  pl: {
    'Preview and test': 'Podgląd i testowanie',
    'Open the live guest journey': 'Otwórz rzeczywistą ścieżkę uczestnika',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Aktywne wydarzenie: przesłane tu selfie są prawdziwymi zgłoszeniami. Obowiązują ustawienia zgód, weryfikacji, publikacji, e-maili i analityki tego wydarzenia.',
  },
  sk: {
    'Preview and test': 'Náhľad a testovanie',
    'Open the live guest journey': 'Otvoriť skutočný priebeh pre účastníka',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Aktívne podujatie: odoslané selfie sú skutočné príspevky. Platia pre ne nastavenia súhlasov, kontroly, zverejnenia, e-mailov a analýzy tohto podujatia.',
  },
  hr: {
    'Preview and test': 'Pretpregled i testiranje',
    'Open the live guest journey': 'Otvori stvarni tijek za posjetitelja',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Aktivni događaj: ovdje poslane fotografije stvarne su prijave. Na njih se primjenjuju postavke privola, provjere, objave, e-pošte i analitike ovog događaja.',
  },
  sl: {
    'Preview and test': 'Predogled in preizkus',
    'Open the live guest journey': 'Odpri dejanski potek za udeleženca',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Aktivni dogodek: tukaj oddani selfiji so resnične oddaje. Zanje veljajo nastavitve soglasij, pregleda, objave, e-pošte in analitike tega dogodka.',
  },
  bg: {
    'Preview and test': 'Преглед и тестване',
    'Open the live guest journey': 'Отвори реалния процес за участници',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Активно събитие: изпратените тук селфита са реални снимки от събитието. За тях важат настройките за съгласие, проверка, публикуване, имейл и анализ на събитието.',
  },
  tr: {
    'Preview and test': 'Önizleme ve test',
    'Open the live guest journey': 'Gerçek katılımcı akışını aç',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Canlı etkinlik: Buradan gönderilen özçekimler gerçek etkinlik gönderileridir. Etkinliğin onay, inceleme, yayın, e-posta ve analiz ayarları uygulanır.',
  },
  ar: {
    'Preview and test': 'معاينة واختبار',
    'Open the live guest journey': 'فتح رحلة المشارك الفعلية',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'فعالية مباشرة: صور السيلفي المرسلة هنا تُحفظ كصور حقيقية للفعالية، وتخضع لإعدادات الموافقة والمراجعة والنشر والبريد الإلكتروني والتحليلات الخاصة بها.',
  },
  hi: {
    'Preview and test': 'पूर्वावलोकन और परीक्षण',
    'Open the live guest journey': 'वास्तविक अतिथि प्रक्रिया खोलें',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'लाइव इवेंट: यहाँ भेजी गई सेल्फ़ी वास्तविक इवेंट फ़ोटो के रूप में सहेजी जाती हैं। उन पर इस इवेंट की सहमति, समीक्षा, प्रकाशन, ईमेल और विश्लेषण सेटिंग लागू होती हैं।',
  },
  ka: {
    'Preview and test': 'წინასწარი ნახვა და ტესტირება',
    'Open the live guest journey': 'მონაწილის რეალური გზის გახსნა',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'აქტიური ღონისძიება: აქ გამოგზავნილი სელფები რეალურ ღონისძიების ფოტოებად ინახება. მათზე ვრცელდება ამ ღონისძიების თანხმობის, შემოწმების, გამოქვეყნების, ელფოსტისა და ანალიტიკის პარამეტრები.',
  },
  'sr-Cyrl': {
    'Preview and test': 'Преглед и тестирање',
    'Open the live guest journey': 'Отвори стварни ток за учесника',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Активан догађај: овде послате селфи фотографије су стварне пријаве. На њих се примењују подешавања сагласности, провере, објављивања, имејла и аналитике овог догађаја.',
  },
  'sr-Latn': {
    'Preview and test': 'Pregled i testiranje',
    'Open the live guest journey': 'Otvori stvarni tok za učesnika',
    'Live event: selfies submitted here are real event submissions. They follow this event’s consent, vetting, publication, email and analytics settings.': 'Aktivan događaj: ovde poslate selfi fotografije su stvarne prijave. Na njih se primenjuju podešavanja saglasnosti, provere, objavljivanja, imejla i analitike ovog događaja.',
  },
};

export function adminShellText(text: string, language: UiLanguage): string {
  const navItem = NAV_ITEM_LABELS[language][text];
  if (navItem) return navItem;
  const navGroup = NAV_GROUP_LABELS[language][text as keyof (typeof NAV_GROUP_LABELS)[UiLanguage]];
  if (navGroup) return navGroup;
  const scopedLabel = SCOPED_NAV_LABELS[language][text];
  if (scopedLabel) return scopedLabel;
  const scopedResource = /^(Partner|Event) (Images|Frames|Frame Slots|Logos|Selfies|Stadiums|Pictures|Dictionary|Vetting words|Landing Pages|Slideshows|Gallery)$/.exec(text);
  if (scopedResource) {
    const [, scope, resource] = scopedResource;
    const prefix = MAP[language][scope as AdminShellText] ?? scope;
    const resourceText: AdminShellText = resource === 'Frame Slots' ? 'Frame slots'
      : resource === 'Selfies' ? 'Sample selfies'
        : resource === 'Stadiums' ? 'Stadium backgrounds'
          : resource as AdminShellText;
    const translated = language === 'en' && (resource === 'Selfies' || resource === 'Stadiums')
      ? resource
      : MAP[language][resourceText] ?? resource;
    return `${prefix} ${translated}`;
  }
  const globalBase = GLOBAL_NAV_LABEL_BASE[text];
  if (globalBase) return language === 'en' ? text : MAP[language][globalBase];
  // Preserve the established context-menu casing while sharing its translation
  // with the page title entry in the main navigation.
  if (text === 'Landing pages') return MAP[language]['Landing Pages'];
  const experienceText = EVENT_EXPERIENCE_TEXT[language]?.[text];
  if (experienceText) return experienceText;
  const templateText = adminExperienceTemplateText(text, language);
  if (templateText !== null) return templateText;
  return MAP[language][text as AdminShellText] ?? text;
}

export function hasAdminShellTranslation(text: string): boolean {
  return ENGLISH.includes(text as AdminShellText)
    || text in NAV_ITEM_LABELS.en
    || text in NAV_GROUP_LABELS.en
    || text in SCOPED_NAV_LABELS.en
    || /^(Partner|Event) (Images|Frames|Frame Slots|Logos|Selfies|Stadiums|Pictures|Dictionary|Vetting words|Landing Pages|Slideshows|Gallery)$/.test(text)
    || text in GLOBAL_NAV_LABEL_BASE
    || text === 'Landing pages'
    || adminExperienceTemplateText(text, 'en') !== null
    || Object.values(EVENT_EXPERIENCE_TEXT).some((messages) => text in messages);
}

export const ADMIN_SHELL_ENGLISH_TEXTS: readonly string[] = ENGLISH;
