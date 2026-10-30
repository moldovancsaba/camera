import { UI_LANGUAGES, type UiLanguage } from '@/lib/i18n';

/** App-owned copy for the user's account page, independent of event wording. */
const ENGLISH = [
  'Account settings',
  'Account details',
  'Name',
  'Email',
  'Interface language',
  'Choose the language used in the admin interface.',
  'Use device language',
  'Save changes',
  'Loading settings…',
  'Settings saved.',
  'Settings could not be loaded.',
  'Settings could not be saved.',
  'Try again',
  'Your name and email are managed by your sign-in account and cannot be changed here.',
] as const;

type AdminAccountText = (typeof ENGLISH)[number];

// Native-language drafts for the same 23 locale variants used by Camera.
const VALUES: Record<UiLanguage, readonly string[]> = {
  en: ENGLISH,
  hu: ['Fiókbeállítások','Fiókadatok','Név','E-mail','Felület nyelve','Válassza ki az adminfelületen használt nyelvet.','Eszköz nyelve','Módosítások mentése','Beállítások betöltése…','Beállítások mentve.','Nem sikerült betölteni a beállításokat.','Nem sikerült menteni a beállításokat.','Próbálja újra','A nevet és az e-mail-címet a bejelentkezési fiók kezeli; itt nem módosíthatók.'],
  de: ['Kontoeinstellungen','Kontodaten','Name','E-Mail','Sprache der Benutzeroberfläche','Wählen Sie die Sprache für die Admin-Oberfläche.','Gerätesprache verwenden','Änderungen speichern','Einstellungen werden geladen…','Einstellungen gespeichert.','Einstellungen konnten nicht geladen werden.','Einstellungen konnten nicht gespeichert werden.','Erneut versuchen','Name und E-Mail werden von Ihrem Anmeldekonto verwaltet und können hier nicht geändert werden.'],
  it: ['Impostazioni account','Dati account','Nome','E-mail','Lingua dell’interfaccia','Scegli la lingua dell’interfaccia di amministrazione.','Usa la lingua del dispositivo','Salva modifiche','Caricamento delle impostazioni…','Impostazioni salvate.','Impossibile caricare le impostazioni.','Impossibile salvare le impostazioni.','Riprova','Il nome e l’e-mail sono gestiti dall’account di accesso e non possono essere modificati qui.'],
  'pt-BR': ['Configurações da conta','Dados da conta','Nome','E-mail','Idioma da interface','Escolha o idioma usado na interface administrativa.','Usar idioma do dispositivo','Salvar alterações','Carregando configurações…','Configurações salvas.','Não foi possível carregar as configurações.','Não foi possível salvar as configurações.','Tentar novamente','Seu nome e e-mail são gerenciados pela sua conta de acesso e não podem ser alterados aqui.'],
  'pt-PT': ['Definições da conta','Dados da conta','Nome','E-mail','Idioma da interface','Escolha o idioma utilizado na interface de administração.','Utilizar o idioma do dispositivo','Guardar alterações','A carregar definições…','Definições guardadas.','Não foi possível carregar as definições.','Não foi possível guardar as definições.','Tentar novamente','O seu nome e e-mail são geridos pela sua conta de início de sessão e não podem ser alterados aqui.'],
  es: ['Configuración de la cuenta','Datos de la cuenta','Nombre','Correo electrónico','Idioma de la interfaz','Elige el idioma de la interfaz de administración.','Usar el idioma del dispositivo','Guardar cambios','Cargando la configuración…','Configuración guardada.','No se pudo cargar la configuración.','No se pudo guardar la configuración.','Intentar de nuevo','Tu cuenta de inicio de sesión administra tu nombre y correo; no se pueden cambiar aquí.'],
  fr: ['Paramètres du compte','Détails du compte','Nom','E-mail','Langue de l’interface','Choisissez la langue de l’interface d’administration.','Utiliser la langue de l’appareil','Enregistrer les modifications','Chargement des paramètres…','Paramètres enregistrés.','Impossible de charger les paramètres.','Impossible d’enregistrer les paramètres.','Réessayer','Votre nom et votre e-mail sont gérés par votre compte de connexion et ne peuvent pas être modifiés ici.'],
  ru: ['Настройки аккаунта','Данные аккаунта','Имя','Электронная почта','Язык интерфейса','Выберите язык интерфейса администратора.','Использовать язык устройства','Сохранить изменения','Загрузка настроек…','Настройки сохранены.','Не удалось загрузить настройки.','Не удалось сохранить настройки.','Повторить','Имя и адрес электронной почты задаются аккаунтом входа и не могут быть изменены здесь.'],
  'zh-Hans': ['账户设置','账户详情','姓名','电子邮件','界面语言','选择管理界面使用的语言。','使用设备语言','保存更改','正在加载设置…','设置已保存。','无法加载设置。','无法保存设置。','重试','姓名和电子邮件由登录账户管理，无法在此更改。'],
  'zh-Hant': ['帳戶設定','帳戶資料','姓名','電子郵件','介面語言','選擇管理介面使用的語言。','使用裝置語言','儲存變更','正在載入設定…','設定已儲存。','無法載入設定。','無法儲存設定。','重試','姓名和電子郵件由登入帳戶管理，無法在此變更。'],
  ro: ['Setările contului','Detalii cont','Nume','E-mail','Limba interfeței','Alegeți limba folosită în interfața de administrare.','Folosește limba dispozitivului','Salvează modificările','Se încarcă setările…','Setările au fost salvate.','Setările nu au putut fi încărcate.','Setările nu au putut fi salvate.','Încearcă din nou','Numele și e-mailul sunt gestionate de contul de autentificare și nu pot fi modificate aici.'],
  pl: ['Ustawienia konta','Dane konta','Imię i nazwisko','E-mail','Język interfejsu','Wybierz język interfejsu administratora.','Użyj języka urządzenia','Zapisz zmiany','Wczytywanie ustawień…','Ustawienia zapisane.','Nie udało się wczytać ustawień.','Nie udało się zapisać ustawień.','Spróbuj ponownie','Imię i nazwisko oraz e-mail są zarządzane przez konto logowania i nie można ich tutaj zmienić.'],
  sk: ['Nastavenia účtu','Údaje účtu','Meno','E-mail','Jazyk rozhrania','Vyberte jazyk používaný v administračnom rozhraní.','Použiť jazyk zariadenia','Uložiť zmeny','Načítavajú sa nastavenia…','Nastavenia boli uložené.','Nastavenia sa nepodarilo načítať.','Nastavenia sa nepodarilo uložiť.','Skúsiť znova','Meno a e-mail spravuje váš prihlasovací účet a tu ich nemožno zmeniť.'],
  hr: ['Postavke računa','Podaci računa','Ime','E-pošta','Jezik sučelja','Odaberite jezik administratorskog sučelja.','Koristi jezik uređaja','Spremi promjene','Učitavanje postavki…','Postavke su spremljene.','Postavke nije moguće učitati.','Postavke nije moguće spremiti.','Pokušaj ponovno','Ime i e-poštu određuje vaš račun za prijavu i ovdje ih nije moguće promijeniti.'],
  sl: ['Nastavitve računa','Podatki računa','Ime','E-pošta','Jezik vmesnika','Izberite jezik skrbniškega vmesnika.','Uporabi jezik naprave','Shrani spremembe','Nalaganje nastavitev…','Nastavitve so shranjene.','Nastavitev ni bilo mogoče naložiti.','Nastavitev ni bilo mogoče shraniti.','Poskusi znova','Ime in e-pošto upravlja vaš prijavni račun in ju tukaj ni mogoče spremeniti.'],
  bg: ['Настройки на акаунта','Данни за акаунта','Име','Имейл','Език на интерфейса','Изберете езика на административния интерфейс.','Използвай езика на устройството','Запазване на промените','Зареждане на настройките…','Настройките са запазени.','Настройките не могат да бъдат заредени.','Настройките не могат да бъдат запазени.','Опитай отново','Името и имейлът се управляват от профила за вход и не могат да се променят тук.'],
  tr: ['Hesap ayarları','Hesap bilgileri','Ad','E-posta','Arayüz dili','Yönetici arayüzünde kullanılacak dili seçin.','Cihaz dilini kullan','Değişiklikleri kaydet','Ayarlar yükleniyor…','Ayarlar kaydedildi.','Ayarlar yüklenemedi.','Ayarlar kaydedilemedi.','Tekrar dene','Adınız ve e-posta adresiniz oturum açma hesabınız tarafından yönetilir ve burada değiştirilemez.'],
  ar: ['إعدادات الحساب','تفاصيل الحساب','الاسم','البريد الإلكتروني','لغة الواجهة','اختر اللغة المستخدمة في واجهة الإدارة.','استخدام لغة الجهاز','حفظ التغييرات','جارٍ تحميل الإعدادات…','تم حفظ الإعدادات.','تعذر تحميل الإعدادات.','تعذر حفظ الإعدادات.','حاول مرة أخرى','يدير حساب تسجيل الدخول اسمك وبريدك الإلكتروني ولا يمكن تغييرهما هنا.'],
  hi: ['खाता सेटिंग','खाते का विवरण','नाम','ईमेल','इंटरफ़ेस भाषा','व्यवस्थापक इंटरफ़ेस की भाषा चुनें।','डिवाइस की भाषा इस्तेमाल करें','बदलाव सहेजें','सेटिंग लोड हो रही हैं…','सेटिंग सहेजी गई।','सेटिंग लोड नहीं हो सकीं।','सेटिंग सहेजी नहीं जा सकीं।','फिर से कोशिश करें','आपका नाम और ईमेल साइन-इन खाते से प्रबंधित होते हैं और यहाँ बदले नहीं जा सकते।'],
  ka: ['ანგარიშის პარამეტრები','ანგარიშის დეტალები','სახელი','ელფოსტა','ინტერფეისის ენა','აირჩიეთ ადმინისტრაციული ინტერფეისის ენა.','მოწყობილობის ენის გამოყენება','ცვლილებების შენახვა','პარამეტრები იტვირთება…','პარამეტრები შენახულია.','პარამეტრების ჩატვირთვა ვერ მოხერხდა.','პარამეტრების შენახვა ვერ მოხერხდა.','ხელახლა ცდა','თქვენს სახელსა და ელფოსტას შესვლის ანგარიში მართავს და მათი შეცვლა აქ შეუძლებელია.'],
  'sr-Cyrl': ['Подешавања налога','Подаци налога','Име','Имејл','Језик интерфејса','Изаберите језик административног интерфејса.','Користи језик уређаја','Сачувај измене','Учитавање подешавања…','Подешавања су сачувана.','Подешавања није могуће учитати.','Подешавања није могуће сачувати.','Покушај поново','Име и имејл се управљају преко налога за пријаву и овде се не могу мењати.'],
  'sr-Latn': ['Podešavanja naloga','Podaci naloga','Ime','Imejl','Jezik interfejsa','Izaberite jezik administratorskog interfejsa.','Koristi jezik uređaja','Sačuvaj izmene','Učitavanje podešavanja…','Podešavanja su sačuvana.','Podešavanja nije moguće učitati.','Podešavanja nije moguće sačuvati.','Pokušaj ponovo','Ime i imejl se upravljaju preko naloga za prijavu i ovde se ne mogu menjati.'],
};

const MAP: Record<UiLanguage, Record<AdminAccountText, string>> = Object.fromEntries(
  UI_LANGUAGES.map((language) => {
    const values = VALUES[language];
    if (values.length !== ENGLISH.length) throw new Error(`Incomplete account settings translations for ${language}`);
    return [language, Object.fromEntries(ENGLISH.map((text, index) => [text, values[index]]))];
  }),
) as Record<UiLanguage, Record<AdminAccountText, string>>;

export function adminAccountText(text: string, language: UiLanguage): string {
  return MAP[language][text as AdminAccountText] ?? text;
}

export const ADMIN_ACCOUNT_ENGLISH_TEXTS: readonly string[] = ENGLISH;
