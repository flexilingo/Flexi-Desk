//! What the user sees when the database cannot be opened or updated at startup: a native
//! dialog (the window cannot open without a database, and a release build has no console)
//! that says where the backup is, with a "Copy details" button, instead of a silent exit.

use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use super::DbInitError;

/// (title, body before the details, copy button, close button, copied confirmation)
fn texts(lang: &str) -> (&'static str, &'static str, &'static str, &'static str, &'static str) {
    match lang {
        "fa" => ("خطا در به‌روزرسانی پایگاه داده", "برنامه نتوانست داده‌های خود را به‌روز کند. داده‌های شما پاک نشده‌اند.", "کپی جزئیات", "بستن", "جزئیات کپی شد. آن را برای پشتیبانی بفرستید."),
        "ar" => ("تعذر تحديث قاعدة البيانات", "تعذر على التطبيق تحديث بياناته. بياناتك لم تُحذف.", "نسخ التفاصيل", "إغلاق", "تم نسخ التفاصيل. أرسلها إلى الدعم."),
        "fr" => ("Mise à jour de la base de données impossible", "L'application n'a pas pu mettre à jour ses données. Vos données n'ont pas été supprimées.", "Copier les détails", "Fermer", "Détails copiés. Envoyez-les au support."),
        "hi" => ("डेटाबेस अपडेट नहीं हो सका", "ऐप अपना डेटा अपडेट नहीं कर सका। आपका डेटा मिटाया नहीं गया है।", "विवरण कॉपी करें", "बंद करें", "विवरण कॉपी हो गया। इसे सहायता टीम को भेजें।"),
        "zh" => ("无法更新数据库", "应用无法更新其数据。您的数据没有被删除。", "复制详情", "关闭", "详情已复制。请发送给支持人员。"),
        "de" => ("Datenbank konnte nicht aktualisiert werden", "Die App konnte ihre Daten nicht aktualisieren. Ihre Daten wurden nicht gelöscht.", "Details kopieren", "Schließen", "Details kopiert. Senden Sie sie an den Support."),
        "vi" => ("Không thể cập nhật cơ sở dữ liệu", "Ứng dụng không thể cập nhật dữ liệu. Dữ liệu của bạn chưa bị xóa.", "Sao chép chi tiết", "Đóng", "Đã sao chép chi tiết. Hãy gửi cho bộ phận hỗ trợ."),
        _ => ("Could not update the database", "The app could not update its data. Your data has not been deleted.", "Copy details", "Close", "Details copied. Send them to support."),
    }
}

fn system_language() -> String {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .filter_map(|k| std::env::var(k).ok())
        .find(|v| !v.is_empty() && v != "C" && v != "POSIX")
        .map(|v| v.chars().take(2).collect::<String>().to_lowercase())
        .unwrap_or_default()
}

fn copy_to_clipboard(text: &str) -> bool {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let candidates: &[(&str, &[&str])] = if cfg!(target_os = "macos") {
        &[("pbcopy", &[])]
    } else if cfg!(target_os = "windows") {
        &[("clip", &[])]
    } else {
        &[("wl-copy", &[]), ("xclip", &["-selection", "clipboard"])]
    };
    for (cmd, args) in candidates {
        if let Ok(mut child) = Command::new(cmd).args(*args).stdin(Stdio::piped()).spawn() {
            if let Some(mut stdin) = child.stdin.take() {
                // `clip` reads the console code page; UTF-16 is not needed for the ASCII details.
                let _ = stdin.write_all(text.as_bytes());
            }
            return child.wait().map(|s| s.success()).unwrap_or(false);
        }
    }
    false
}

/// Show the failure dialog and block until it is closed. The caller then exits.
pub fn report_db_failure(app: &tauri::AppHandle, err: &DbInitError) {
    let (title, intro, copy, close, copied) = texts(&system_language());
    let details = err.details();
    // Also on disk next to the database, for the case where no clipboard tool exists.
    if let Some(dir) = err.db_path.parent() {
        let _ = std::fs::write(dir.join("startup-error.txt"), &details);
    }
    let backup_line = err
        .backup
        .as_ref()
        .map(|b| format!("\n\n{}", b.display()))
        .unwrap_or_default();
    let wants_copy = app
        .dialog()
        .message(format!("{intro}{backup_line}\n\n{}", err.message))
        .title(title)
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::OkCancelCustom(copy.to_string(), close.to_string()))
        .blocking_show();
    if wants_copy && copy_to_clipboard(&details) {
        app.dialog().message(copied).title(title).kind(MessageDialogKind::Info).blocking_show();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_ui_language_has_its_own_text_and_unknown_falls_back_to_english() {
        let en = texts("en").0;
        for l in ["fa", "ar", "fr", "hi", "zh", "de", "vi"] {
            assert_ne!(texts(l).0, en, "{l}");
        }
        assert_eq!(texts("xx").0, en);
    }
}
