package com.gordeyville.shop;

import static org.junit.Assert.*;
import org.junit.Test;

/** Widget model (redesign Nov 15): who sees what, size modes, status wording. Runs on the build machine. */
public class WidgetModelTest {
    static final String ADMIN = "{\"v\":2,\"at\":1000,\"role\":\"admin\",\"name\":\"Kyle\",\"theme\":\"dark\","
        + "\"hero\":{\"tag\":\"Pick up\",\"title\":\"Pick up at Russel\",\"sub\":\"1086WT\",\"c\":\"#22c3e6\",\"act\":\"Picked up – count it\",\"link\":{\"count\":[\"j1\",\"s1\"]}},"
        + "\"items\":[{\"tag\":\"Quote\",\"title\":\"Review the quote\",\"sub\":\"\",\"c\":\"#ff8a2a\",\"act\":\"Open\",\"link\":{\"job\":\"j1\"}}],\"total\":2,"
        + "\"nav\":[{\"label\":\"Home\",\"link\":{\"v\":\"home\"}},{\"label\":\"Jobs\",\"link\":{\"v\":\"overview\"}},{\"label\":\"Purchasing\",\"link\":{\"v\":\"purchasing\"}},{\"label\":\"Crew\",\"link\":{\"v\":\"crew\"}}]}";
    static final String CREW = "{\"v\":2,\"at\":1000,\"role\":\"crew\",\"name\":\"Colton\",\"theme\":\"dark\",\"hero\":null,"
        + "\"timer\":{\"since\":500,\"task\":\"Build headache rack\",\"job\":\"1086WT\",\"c\":\"#e5483b\",\"link\":{\"task\":[\"j1\",\"a1\"],\"why\":\"stop\"},\"draw\":{\"draw\":\"j1\"}},"
        + "\"items\":[],\"total\":1,\"nav\":[{\"label\":\"Today\",\"link\":{\"v\":\"today\"}},{\"label\":\"Jobs\",\"link\":{\"v\":\"build\"}},{\"label\":\"Drawings\",\"link\":{\"v\":\"drawings\"}},{\"label\":\"Time\",\"link\":{\"v\":\"time\"}}]}";
    static final String SERVER_TODO = "{\"next\":[{\"text\":\"Give work to Aaron\",\"tag\":\"CREW\",\"c\":\"#ff8a2a\",\"job\":\"\",\"tab\":\"crew\"},{\"text\":\"Pick up at Russel\",\"tag\":\"PICK UP\",\"c\":\"#22c3e6\",\"job\":\"j1\"}],\"review\":0}";

    static WidgetModel m(String snap, boolean key, String server, long serverAt) {
        WidgetModel.Input in = new WidgetModel.Input(); in.snapshot = snap; in.hasKey = key; in.serverTodo = server; in.serverTodoAt = serverAt; return WidgetModel.from(in);
    }

    @Test public void signedOutShowsNothingFromBefore() {
        WidgetModel x = m(ADMIN, false, SERVER_TODO, 5000);
        assertEquals(WidgetModel.State.NO_USER, x.state); assertNull(x.hero); assertTrue(x.items.isEmpty()); assertTrue(x.nav.isEmpty());
    }
    @Test public void unknownRoleIsSafe() {
        assertEquals(WidgetModel.State.SETUP, m(null, true, SERVER_TODO, 5000).state);
        assertEquals(WidgetModel.State.SETUP, m("{\"v\":2,\"role\":\"\"}", true, SERVER_TODO, 5000).state);
        assertEquals(WidgetModel.State.SETUP, m("{\"v\":1,\"role\":\"admin\"}", true, SERVER_TODO, 5000).state);
        WidgetModel s = m("{\"v\":2,\"role\":\"boss\"}", true, SERVER_TODO, 5000);
        assertEquals(WidgetModel.State.SETUP, s.state); assertNull(s.hero);
    }
    @Test public void crewNeverGetsKylesList() {
        WidgetModel c = m(CREW, true, SERVER_TODO, 99999);
        assertEquals("crew", c.role); assertNull(c.hero); assertTrue(c.items.isEmpty());
        assertNotNull(c.timer); assertEquals("Build headache rack", c.timer.title); assertTrue(c.timer.link.contains("\"why\":\"stop\""));
        assertEquals("{\"draw\":\"j1\"}", c.timerDraw);
    }
    @Test public void kyleUsesNewerServerList() {
        WidgetModel old = m(ADMIN, true, SERVER_TODO, 500);
        assertEquals("Pick up at Russel", old.hero.title);                 // phone's copy is newer
        WidgetModel nw = m(ADMIN, true, SERVER_TODO, 5000);
        assertEquals("Give work to Aaron", nw.hero.title);                 // server copy is newer
        assertEquals("Crew", nw.hero.tag);
        assertEquals("{\"v\":\"crew\"}", nw.hero.link);
        assertEquals("{\"job\":\"j1\"}", nw.items.get(0).link);
        assertEquals(5000, nw.dataAt);
    }
    @Test public void linksSurvive() {
        WidgetModel a = m(ADMIN, true, null, 0);
        assertEquals("{\"count\":[\"j1\",\"s1\"]}", a.hero.link);
        assertEquals("Picked up – count it", a.hero.act);
        assertEquals(4, a.nav.size()); assertEquals("{\"v\":\"overview\"}", a.nav.get(1).link);
    }
    @Test public void sizeModes() {
        assertEquals(WidgetModel.Mode.COMPACT, WidgetModel.bucket(180, 120).mode);
        assertEquals(WidgetModel.Mode.COMPACT_WIDE, WidgetModel.bucket(320, 120).mode);
        assertEquals(WidgetModel.Mode.MEDIUM, WidgetModel.bucket(300, 260).mode);
        assertEquals(WidgetModel.Mode.LARGE, WidgetModel.bucket(330, 450).mode);
        assertEquals(4, WidgetModel.bucket(330, 450).navCount);
        assertEquals(3, WidgetModel.bucket(260, 450).navCount);
        assertEquals(2, WidgetModel.bucket(260, 340).navCount);
        for (float[] s : WidgetModel.SIZES) assertNotNull(WidgetModel.bucket(s[0], s[1]));
    }
    @Test public void navWhenShortOfRoom() {
        WidgetModel a = m(ADMIN, true, null, 0);
        assertEquals("Jobs,Purchasing", labels(a.navFor(2)));
        assertEquals("Jobs,Purchasing,Crew", labels(a.navFor(3)));
        assertEquals("Home,Jobs,Purchasing,Crew", labels(a.navFor(4)));
        WidgetModel c = m(CREW, true, null, 0);
        assertEquals("Jobs,Drawings", labels(c.navFor(2)));
    }
    static String labels(java.util.List<WidgetModel.Nav> n) { StringBuilder b = new StringBuilder(); for (WidgetModel.Nav x : n) { if (b.length() > 0) b.append(","); b.append(x.label); } return b.toString(); }
    @Test public void statusWording() {
        WidgetModel.Input in = new WidgetModel.Input(); in.snapshot = ADMIN; in.hasKey = true;
        long now = System.currentTimeMillis();
        in.snapshot = ADMIN.replace("\"at\":1000", "\"at\":" + (now - 30_000));
        assertEquals("Updated just now", WidgetModel.from(in).statusLine(now)[0]);
        in.refreshing = true; assertEquals("Updating…", WidgetModel.from(in).statusLine(now)[0]); in.refreshing = false;
        in.errKind = "offline"; String[] s = WidgetModel.from(in).statusLine(now); assertTrue(s[0].startsWith("Offline · showing ")); assertEquals("amber", s[1]);
        in.errKind = "auth"; assertEquals("Sign in again to update", WidgetModel.from(in).statusLine(now)[0]);
        in.errKind = "failed"; assertTrue(WidgetModel.from(in).statusLine(now)[0].startsWith("Couldn't update"));
        in.errKind = ""; in.snapshot = ADMIN.replace("\"at\":1000", "\"at\":" + (now - 5 * 3600_000L));
        assertTrue(WidgetModel.from(in).statusLine(now)[0].startsWith("Not updated since "));
    }
    @Test public void acronymsStayCapital() {
        assertEquals("NCR", WidgetModel.sentence("NCR"));
        assertEquals("No job #", WidgetModel.sentence("NO JOB #"));
        assertEquals("Count PO-1009", WidgetModel.sentence("COUNT po-1009"));
    }
}
