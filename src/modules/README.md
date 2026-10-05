# Модули

Каждый инструмент — папка `src/modules/<id>/` по контракту из `MODULE_SPEC.md`:

```
<id>/
├── index.js      # manifest: id, name, icon, sizes, mount/resize/unmount…
├── <id>.css
└── i18n/{ru,uz,en}.json
```

Встроенные модули регистрируются в `src/modules/index.js`.

| id       | Инструмент        |
|----------|-------------------|
| `metro`  | Метроном          |
| `tuner`  | Тюнер             |
| `timer`  | Помодоро          |
| `audio`  | Медиатека         |
| `piano`  | Пианино           |
| `drone`  | Пэды и дрон       |
| `theory` | Теория            |
| `ear`    | Тренажёр слуха    |
| `tabs`   | Табулатуры        |
| `text`   | Текст и аккорды   |

id взяты из прототипа (`TOOLS` в `legacy/practice.html`), чтобы сохранённые данные подходили без миграции.
