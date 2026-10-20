// Без консольного окна в выпуске (Windows)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    melete_lib::run()
}
