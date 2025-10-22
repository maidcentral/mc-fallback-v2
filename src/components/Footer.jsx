export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t py-6 md:py-0 mt-auto">
      <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row max-w-7xl mx-auto px-4">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            © {currentYear} MaidCentral Backup System. Emergency use only.
          </p>
        </div>
        <p className="text-center text-xs text-muted-foreground md:text-right">
          Offline Schedule Viewer
        </p>
      </div>
    </footer>
  )
}
