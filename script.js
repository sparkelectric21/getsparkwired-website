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

const solutionPaths = new Set([
  "/spark-mount",
  "/spark-connect",
  "/spark-home",
  "/spark-illuminate",
  "/spark-wire",
  "/spark-restore",
]);
const currentPath = normalizePath(window.location.pathname);
const currentPage = solutionPaths.has(currentPath) ? "/services" : currentPath;
document.querySelectorAll(".site-nav a").forEach((link) => {
  link.removeAttribute("aria-current");
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

const selectWeightedVerse = (verses) => {
  const availableVerses = verses.filter((verse) => {
    return verse && typeof verse.text === "string" && typeof verse.reference === "string" && Number(verse.weight) > 0;
  });

  if (!availableVerses.length) {
    return null;
  }

  const totalWeight = availableVerses.reduce((total, verse) => total + Number(verse.weight), 0);
  let threshold = Math.random() * totalWeight;

  for (const verse of availableVerses) {
    threshold -= Number(verse.weight);

    if (threshold <= 0) {
      return verse;
    }
  }

  return availableVerses[availableVerses.length - 1];
};

const renderFooterVerse = () => {
  const verses = window.sparkVerses;
  const footer = document.querySelector(".site-footer");
  const footerBottom = footer ? footer.querySelector(".footer-bottom") : null;

  if (!Array.isArray(verses) || !footer || !footerBottom || footer.querySelector(".footer-verse")) {
    return;
  }

  const selectedVerse = selectWeightedVerse(verses);

  if (!selectedVerse) {
    return;
  }

  const verseWrap = document.createElement("div");
  verseWrap.className = "footer-verse";

  const heading = document.createElement("p");
  heading.className = "footer-verse-heading";
  heading.textContent = "A verse that inspires our work";

  const verseText = document.createElement("blockquote");
  verseText.className = "footer-verse-text";
  verseText.textContent = `“${selectedVerse.text}”`;

  const reference = document.createElement("p");
  reference.className = "footer-verse-reference";
  reference.textContent = selectedVerse.reference;

  verseWrap.append(heading, verseText, reference);
  footerBottom.insertAdjacentElement("afterend", verseWrap);
};

renderFooterVerse();
