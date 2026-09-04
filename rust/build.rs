fn main() {
    cc::Build::new().file("src/chkstk_stub.c").compile("chkstk_stub");
    println!("cargo:rerun-if-changed=src/chkstk_stub.c");
}
