import SwiftUI

struct Views: View {
    var body: some View {
        VStack {
            Text("Total").font(.system(size: 13))            // fixed-font
            Text("Body").font(.body)                          // fine
            Text("Brand").font(.custom("Serif", size: 17))    // scales relative to body: fine
            Button { save() } label: {
                Image("save-glyph")                           // asset-image-button
            }
            Button { share() } label: {
                Image("share-glyph")
            }
            .accessibilityLabel("Share")                      // fine
            Image("hero", decorative: true)                   // fine
            Text("Row").onTapGesture { open() }               // tap-gesture
            Text("Ok").onTapGesture { open() }
                .accessibilityAddTraits(.isButton)            // fine
        }
        .dynamicTypeSize(.xSmall ... .xxLarge)                // dynamic-type-cap
        // Text("x").font(.system(size: 9)) commented out: ignored
    }
}
