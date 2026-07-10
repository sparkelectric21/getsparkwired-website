const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });
}

const normalizePath = (path) => {
  const cleanPath = path.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  return cleanPath === "" ? "/" : cleanPath;
};

const currentPage = normalizePath(window.location.pathname);
document.querySelectorAll(".site-nav a").forEach((link) => {
  if (normalizePath(link.getAttribute("href")) === currentPage) {
    link.setAttribute("aria-current", "page");
  }
});

const revealElements = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  revealElements.forEach((element) => observer.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("is-visible"));
}
